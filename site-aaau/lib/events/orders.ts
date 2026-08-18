import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  cpfHash,
  isValidCpf,
  onlyDigits,
  sanitizeText,
} from "@/lib/checkout/mercado-pago";
import {
  assertTicketEventSalesOpen,
  getTicketCountForCommercialUnits,
  getTicketLotMaxUnitsPerOrder,
  selectActiveTicketLot,
} from "@/lib/events/availability";
import {
  ACCESS_TOKEN_BYTES,
  EVENT_ORDER_EXPIRATION_BATCH_SIZE,
  EVENT_TICKET_RESERVATION_MINUTES,
} from "@/lib/events/constants";
import {
  EventCheckoutStaleError,
  EventNotFoundError,
  EventOrderExpiredError,
  EventOrderInvalidStatusError,
  EventOrderNotFoundError,
  IdempotencyConflictError,
  InvalidBuyerDataError,
  InvalidPartnerCodeError,
  InvalidParticipantDataError,
  InvalidTicketQuantityError,
  LateApprovedPaymentError,
  NoActiveTicketLotError,
  InsufficientTicketAvailabilityError,
  PaymentAmountMismatchError,
  PaymentIdConflictError,
} from "@/lib/events/errors";
import { assertSameMoney, multiplyMoney, toMoney } from "@/lib/events/money";
import {
  calculatePartnerDiscount,
  confirmPartnerCodeUse,
  normalizePartnerCode,
  releasePartnerCodeUse,
  reservePartnerCodeUse,
  validatePartnerCode,
} from "@/lib/events/partner-codes";
import {
  confirmLotSale,
  releaseLotReservation,
  reserveLotTickets,
} from "@/lib/events/reservations";
import { issueEventTicketsForPaidOrder } from "@/lib/events/tickets";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";
import type {
  ConfirmEventOrderPaymentInput,
  ConfirmEventOrderPaymentResult,
  CreateEventOrderReservationInput,
  CreateEventOrderReservationResult,
  EventParticipantInput,
  EventTx,
} from "@/lib/events/types";

function secureToken(bytes = ACCESS_TOKEN_BYTES) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashCanonical(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizePhone(value?: string | null) {
  const digits = onlyDigits(value ?? "");
  return digits || null;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeParticipant(participant: EventParticipantInput, participantIndex: number) {
  const cpf = onlyDigits(participant.cpf);
  const name = sanitizeText(participant.name);
  const email = normalizeEmail(participant.email);
  const phone = normalizePhone(participant.phone);
  const birthDate = participant.birthDate ? new Date(participant.birthDate) : null;

  if (!isValidCpf(cpf)) {
    throw new InvalidParticipantDataError(participantIndex, "cpf", "PARTICIPANT_CPF_INVALID");
  }
  if (email && !emailPattern.test(email)) {
    throw new InvalidParticipantDataError(participantIndex, "email", "PARTICIPANT_EMAIL_INVALID");
  }
  if (phone && phone.length < 10) {
    throw new InvalidParticipantDataError(participantIndex, "phone", "PARTICIPANT_PHONE_INVALID");
  }
  if (birthDate && Number.isNaN(birthDate.getTime())) {
    throw new InvalidParticipantDataError(participantIndex, "birthDate", "PARTICIPANT_BIRTH_DATE_INVALID");
  }

  return {
    name,
    cpf,
    cpfHash: cpfHash(cpf),
    cpfLast4: cpf.slice(-4),
    email,
    phone,
    birthDate,
    institution: participant.institution ? sanitizeText(participant.institution) : null,
    course: participant.course ? sanitizeText(participant.course) : null,
    campus: participant.campus ? sanitizeText(participant.campus) : null,
  };
}

function assertRequiredParticipantFields(
  event: {
    requireParticipantEmail: boolean;
    requireParticipantPhone: boolean;
    requireBirthDate: boolean;
    requireInstitution: boolean;
    requireCourse: boolean;
    requireCampus: boolean;
    minimumAge: number | null;
    startAt: Date;
  },
  participant: ReturnType<typeof normalizeParticipant>,
  participantIndex: number,
) {
  if (!participant.name) {
    throw new InvalidParticipantDataError(participantIndex, "name", "PARTICIPANT_NAME_REQUIRED");
  }
  if (event.requireParticipantEmail && !participant.email) {
    throw new InvalidParticipantDataError(participantIndex, "email", "PARTICIPANT_EMAIL_REQUIRED");
  }
  if (event.requireParticipantPhone && !participant.phone) {
    throw new InvalidParticipantDataError(participantIndex, "phone", "PARTICIPANT_PHONE_REQUIRED");
  }
  if ((event.requireBirthDate || event.minimumAge !== null) && !participant.birthDate) {
    throw new InvalidParticipantDataError(participantIndex, "birthDate", "PARTICIPANT_BIRTH_DATE_REQUIRED");
  }
  if (event.requireInstitution && !participant.institution) {
    throw new InvalidParticipantDataError(participantIndex, "institution", "PARTICIPANT_INSTITUTION_REQUIRED");
  }
  if (event.requireCourse && !participant.course) {
    throw new InvalidParticipantDataError(participantIndex, "course", "PARTICIPANT_COURSE_REQUIRED");
  }
  if (event.requireCampus && !participant.campus) {
    throw new InvalidParticipantDataError(participantIndex, "campus", "PARTICIPANT_CAMPUS_REQUIRED");
  }
  if (event.minimumAge !== null && participant.birthDate) {
    let age = event.startAt.getUTCFullYear() - participant.birthDate.getUTCFullYear();
    const birthdayNotReached = event.startAt.getUTCMonth() < participant.birthDate.getUTCMonth() ||
      (event.startAt.getUTCMonth() === participant.birthDate.getUTCMonth() &&
        event.startAt.getUTCDate() < participant.birthDate.getUTCDate());
    if (birthdayNotReached) age -= 1;
    if (age < event.minimumAge) {
      throw new InvalidParticipantDataError(
        participantIndex,
        "birthDate",
        "PARTICIPANT_MINIMUM_AGE_NOT_MET",
        { minimumAge: event.minimumAge },
      );
    }
  }
}

function buildReservationFingerprint(input: {
  eventId: string;
  buyerCpfHash: string | null;
  buyerEmail: string;
  buyerPhone: string;
  participantCpfHashes: string[];
  partnerCode: string | null;
  ticketLotId: string;
  commercialUnitQuantity: number;
  ticketsPerUnit: number;
}) {
  return hashCanonical({
    eventId: input.eventId,
    buyerCpfHash: input.buyerCpfHash,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    participantCpfHashes: [...input.participantCpfHashes].sort(),
    partnerCode: input.partnerCode,
    ticketLotId: input.ticketLotId,
    commercialUnitQuantity: input.commercialUnitQuantity,
    ticketsPerUnit: input.ticketsPerUnit,
  });
}

function expiresAtFrom(now: Date) {
  return new Date(now.getTime() + EVENT_TICKET_RESERVATION_MINUTES * 60_000);
}

function groupParticipantsByLot(participants: Array<{ ticketLotId: string }>) {
  return participants.reduce((map, participant) => {
    map.set(participant.ticketLotId, (map.get(participant.ticketLotId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
}

function commercialUnitsByLot(order: {
  ticketLotId: string | null;
  commercialUnitQuantity: number;
  participants: Array<{ ticketLotId: string }>;
}) {
  return order.ticketLotId
    ? new Map([[order.ticketLotId, order.commercialUnitQuantity]])
    : groupParticipantsByLot(order.participants);
}

function buildLegacyReservationFingerprint(input: {
  eventId: string;
  buyerCpfHash: string | null;
  buyerEmail: string;
  buyerPhone: string;
  participantCpfHashes: string[];
  partnerCode: string | null;
}) {
  return hashCanonical({
    eventId: input.eventId,
    buyerCpfHash: input.buyerCpfHash,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    participantCpfHashes: [...input.participantCpfHashes].sort(),
    partnerCode: input.partnerCode,
  });
}

async function createEventOrderReservationOnce(
  input: CreateEventOrderReservationInput,
): Promise<CreateEventOrderReservationResult> {
  return runSerializableTransactionWithRetry(async (tx) => {
    const now = input.now ?? new Date();
    const event = await tx.ticketEvent.findFirst({
      where: input.eventId ? { id: input.eventId } : { slug: input.slug ?? "" },
      include: { lots: true },
    });

    if (!event) {
      throw new EventNotFoundError();
    }

    assertTicketEventSalesOpen(event, now);

    let lot: ReturnType<typeof selectActiveTicketLot>;

    try {
      lot = selectActiveTicketLot(event.lots, now);
    } catch (error) {
      if (error instanceof NoActiveTicketLotError) {
        throw new InsufficientTicketAvailabilityError();
      }
      throw error;
    }

    if (input.ticketLotId && input.ticketLotId !== lot.id) {
      throw new EventCheckoutStaleError();
    }

    const ticketsPerUnit = lot.ticketsPerUnit ?? 1;
    if (ticketsPerUnit > 1 &&
      (input.ticketLotId === undefined || input.commercialUnitQuantity === undefined)) {
      throw new EventCheckoutStaleError();
    }
    const commercialUnitQuantity = input.commercialUnitQuantity ??
      (input.participants.length / ticketsPerUnit);
    const ticketCount = getTicketCountForCommercialUnits(lot, commercialUnitQuantity);
    const maxUnitsPerOrder = getTicketLotMaxUnitsPerOrder(event, lot);
    if (!Number.isInteger(commercialUnitQuantity) || commercialUnitQuantity < 1) {
      throw new InvalidTicketQuantityError("COMMERCIAL_UNIT_QUANTITY_INVALID", {
        commercialUnitQuantity,
      });
    }
    if (commercialUnitQuantity > maxUnitsPerOrder) {
      throw new InvalidTicketQuantityError("MAX_UNITS_PER_ORDER_EXCEEDED", {
        commercialUnitQuantity,
        maxUnitsPerOrder,
        ticketsPerUnit,
      });
    }
    if (input.participants.length !== ticketCount) {
      throw new InvalidTicketQuantityError("PARTICIPANT_COUNT_MISMATCH", {
        commercialUnitQuantity,
        ticketsPerUnit,
        participantsCount: input.participants.length,
        expectedParticipantsCount: ticketCount,
        maxUnitsPerOrder,
      });
    }

    const participants = input.participants.map(normalizeParticipant);
    const participantCpfHashes = participants.map((participant) => participant.cpfHash);

    const firstParticipantByCpf = new Map<string, number>();
    for (const [participantIndex, participantCpfHash] of participantCpfHashes.entries()) {
      if (firstParticipantByCpf.has(participantCpfHash)) {
        throw new InvalidParticipantDataError(
          participantIndex,
          "cpf",
          "DUPLICATE_PARTICIPANT_CPF",
        );
      }
      firstParticipantByCpf.set(participantCpfHash, participantIndex);
    }

    for (const [participantIndex, participant] of participants.entries()) {
      assertRequiredParticipantFields(event, participant, participantIndex);
    }

    const buyerCpf = input.buyer.cpf ? onlyDigits(input.buyer.cpf) : null;
    const buyerName = sanitizeText(input.buyer.name);
    if (buyerName.length < 2) {
      throw new InvalidBuyerDataError("name", "BUYER_NAME_REQUIRED");
    }
    if (buyerCpf && !isValidCpf(buyerCpf)) {
      throw new InvalidBuyerDataError("cpf", "BUYER_CPF_INVALID");
    }

    const buyerEmail = normalizeEmail(input.buyer.email);
    const buyerPhone = normalizePhone(input.buyer.phone);

    if (!buyerEmail || !emailPattern.test(buyerEmail)) {
      throw new InvalidBuyerDataError("email", "BUYER_EMAIL_INVALID");
    }
    if (!buyerPhone || buyerPhone.length < 10) {
      throw new InvalidBuyerDataError("phone", "BUYER_PHONE_INVALID");
    }

    const normalizedPartnerCode = input.partnerCode ? normalizePartnerCode(input.partnerCode) : null;
    const fingerprint = buildReservationFingerprint({
      eventId: event.id,
      buyerCpfHash: buyerCpf ? cpfHash(buyerCpf) : null,
      buyerEmail,
      buyerPhone,
      participantCpfHashes,
      partnerCode: normalizedPartnerCode,
      ticketLotId: lot.id,
      commercialUnitQuantity,
      ticketsPerUnit,
    });
    const legacyFingerprint = buildLegacyReservationFingerprint({
      eventId: event.id,
      buyerCpfHash: buyerCpf ? cpfHash(buyerCpf) : null,
      buyerEmail,
      buyerPhone,
      participantCpfHashes,
      partnerCode: normalizedPartnerCode,
    });

    if (input.idempotencyKey) {
      const existing = await tx.eventOrder.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (existing) {
        if (existing.payloadFingerprint !== fingerprint && existing.payloadFingerprint !== legacyFingerprint) {
          throw new IdempotencyConflictError();
        }

        return {
          orderId: existing.id,
          externalReference: existing.externalReference,
          accessToken: existing.accessToken,
          expiresAt: existing.expiresAt,
          total: existing.total,
          alreadyCreated: true,
        };
      }
    }

    const partnerCode = normalizedPartnerCode
      ? await tx.eventPartnerCode.findUnique({
          where: { eventId_code: { eventId: event.id, code: normalizedPartnerCode } },
        })
      : null;

    if (normalizedPartnerCode && !partnerCode) {
      throw new InvalidPartnerCodeError();
    }

    if (partnerCode) {
      validatePartnerCode(partnerCode, event.id, now);
    }

    await reserveLotTickets(tx, lot.id, commercialUnitQuantity);

    if (partnerCode) {
      await reservePartnerCodeUse(tx, partnerCode.id);
    }

    const subtotal = multiplyMoney(lot.price, commercialUnitQuantity);
    const discountAmount = calculatePartnerDiscount(partnerCode, subtotal);
    const total = toMoney(subtotal.minus(discountAmount));
    const orderId = crypto.randomUUID();
    const externalReference = `event_order:${orderId}`;
    const accessToken = secureToken();

    const order = await tx.eventOrder.create({
      data: {
        id: orderId,
        eventId: event.id,
        ticketLotId: lot.id,
        commercialUnitQuantity,
        ticketsPerUnit,
        commercialUnitPrice: lot.price,
        buyerName,
        buyerCpf,
        buyerCpfHash: buyerCpf ? cpfHash(buyerCpf) : null,
        buyerCpfLast4: buyerCpf ? buyerCpf.slice(-4) : null,
        buyerEmail,
        buyerPhone,
        partnerCodeId: partnerCode?.id ?? null,
        subtotal,
        discountAmount,
        total,
        externalReference,
        idempotencyKey: input.idempotencyKey ?? null,
        payloadFingerprint: fingerprint,
        accessToken,
        expiresAt: expiresAtFrom(now),
        participants: {
          create: participants.map((participant) => ({
            ticketLotId: lot.id,
            name: participant.name,
            cpf: participant.cpf,
            cpfHash: participant.cpfHash,
            cpfLast4: participant.cpfLast4,
            email: participant.email,
            phone: participant.phone,
            birthDate: participant.birthDate,
            institution: participant.institution,
            course: participant.course,
            campus: participant.campus,
          })),
        },
      },
    });

    return {
      orderId: order.id,
      externalReference: order.externalReference,
      accessToken: order.accessToken,
      expiresAt: order.expiresAt,
      total: order.total,
      alreadyCreated: false,
    };
  });
}

export async function createEventOrderReservation(
  input: CreateEventOrderReservationInput,
): Promise<CreateEventOrderReservationResult> {
  try {
    return await createEventOrderReservationOnce(input);
  } catch (error) {
    if (
      input.idempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return createEventOrderReservationOnce(input);
    }

    throw error;
  }
}

async function expireEventOrderReservationTx(tx: EventTx, orderId: string, now: Date) {
  const order = await tx.eventOrder.findUnique({
    where: { id: orderId },
    include: { participants: true },
  });

  if (!order) {
    throw new EventOrderNotFoundError();
  }

  if (order.status !== "PENDING") {
    return { expired: false, alreadyFinal: true };
  }

  if (order.expiresAt > now) {
    return { expired: false, alreadyFinal: false };
  }

  for (const [lotId, quantity] of commercialUnitsByLot(order)) {
    await releaseLotReservation(tx, lotId, quantity);
  }

  if (order.partnerCodeId) {
    await releasePartnerCodeUse(tx, order.partnerCodeId);
  }

  await tx.eventOrder.update({
    where: { id: order.id },
    data: {
      status: "EXPIRED",
      canceledAt: now,
    },
  });

  return { expired: true, alreadyFinal: false };
}

export async function expireEventOrderReservation(orderId: string, now = new Date()) {
  return runSerializableTransactionWithRetry((tx) => expireEventOrderReservationTx(tx, orderId, now));
}

export async function cancelEventOrderReservationAfterCheckoutFailure(
  orderId: string,
  now = new Date(),
) {
  return runSerializableTransactionWithRetry(async (tx) => {
    const order = await tx.eventOrder.findUnique({
      where: { id: orderId },
      include: { participants: true },
    });

    if (!order) {
      throw new EventOrderNotFoundError();
    }

    if (order.status !== "PENDING") {
      return { canceled: false, alreadyFinal: true };
    }

    for (const [lotId, quantity] of commercialUnitsByLot(order)) {
      await releaseLotReservation(tx, lotId, quantity);
    }

    if (order.partnerCodeId) {
      await releasePartnerCodeUse(tx, order.partnerCodeId);
    }

    await tx.eventOrder.update({
      where: { id: order.id },
      data: {
        status: "CANCELED",
        canceledAt: now,
      },
    });

    return { canceled: true, alreadyFinal: false };
  });
}

export async function expireDueEventOrderReservations(limit = EVENT_ORDER_EXPIRATION_BATCH_SIZE) {
  const now = new Date();
  const dueOrders = await prisma.eventOrder.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now },
    },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });

  let expired = 0;

  for (const order of dueOrders) {
    const result = await expireEventOrderReservation(order.id, now);
    if (result.expired) expired += 1;
  }

  return { scanned: dueOrders.length, expired };
}

export async function confirmEventOrderPayment(
  input: ConfirmEventOrderPaymentInput,
): Promise<ConfirmEventOrderPaymentResult> {
  return runSerializableTransactionWithRetry(async (tx) => {
    const now = input.now ?? new Date();
    const paidAt = input.paidAt ?? now;
    const order = await tx.eventOrder.findUnique({
      where: { id: input.eventOrderId },
      include: { participants: true, tickets: true },
    });

    if (!order) {
      throw new EventOrderNotFoundError();
    }

    if (order.status === "PAID") {
      return { alreadyProcessed: true, newlyPaid: false, ticketsIssued: 0 };
    }

    if (order.status === "EXPIRED" || order.expiresAt <= now) {
      throw new LateApprovedPaymentError();
    }

    if (order.status !== "PENDING") {
      throw new EventOrderInvalidStatusError();
    }

    if (!input.paymentId.trim()) {
      throw new PaymentIdConflictError();
    }

    if (!assertSameMoney(order.total, input.paidAmount)) {
      throw new PaymentAmountMismatchError();
    }

    const existingPayment = await tx.eventOrder.findFirst({
      where: {
        mercadoPagoPaymentId: input.paymentId,
        NOT: { id: order.id },
      },
      select: { id: true },
    });

    if (existingPayment) {
      throw new PaymentIdConflictError();
    }

    for (const [lotId, quantity] of commercialUnitsByLot(order)) {
      await confirmLotSale(tx, lotId, quantity);
    }

    if (order.partnerCodeId) {
      await confirmPartnerCodeUse(tx, order.partnerCodeId);
    }

    await tx.eventOrder.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        mercadoPagoPaymentId: input.paymentId,
        paidAt,
      },
    });

    const ticketsIssued = await issueEventTicketsForPaidOrder(tx, order.id, paidAt);

    return { alreadyProcessed: false, newlyPaid: true, ticketsIssued };
  });
}
