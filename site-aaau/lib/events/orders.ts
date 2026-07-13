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
  selectActiveTicketLot,
} from "@/lib/events/availability";
import {
  ACCESS_TOKEN_BYTES,
  EVENT_ORDER_EXPIRATION_BATCH_SIZE,
  EVENT_TICKET_RESERVATION_MINUTES,
} from "@/lib/events/constants";
import {
  EventNotFoundError,
  EventOrderExpiredError,
  EventOrderInvalidStatusError,
  EventOrderNotFoundError,
  IdempotencyConflictError,
  InvalidPartnerCodeError,
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

function normalizeParticipant(participant: EventParticipantInput) {
  const cpf = onlyDigits(participant.cpf);

  if (!isValidCpf(cpf)) {
    throw new InvalidTicketQuantityError();
  }

  return {
    name: sanitizeText(participant.name),
    cpf,
    cpfHash: cpfHash(cpf),
    cpfLast4: cpf.slice(-4),
    email: normalizeEmail(participant.email),
    phone: normalizePhone(participant.phone),
    birthDate: participant.birthDate ? new Date(participant.birthDate) : null,
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
  },
  participant: ReturnType<typeof normalizeParticipant>,
) {
  if (!participant.name || !participant.cpf) {
    throw new InvalidTicketQuantityError();
  }

  if (event.requireParticipantEmail && !participant.email) throw new InvalidTicketQuantityError();
  if (event.requireParticipantPhone && !participant.phone) throw new InvalidTicketQuantityError();
  if (event.requireBirthDate && !participant.birthDate) throw new InvalidTicketQuantityError();
  if (event.requireInstitution && !participant.institution) throw new InvalidTicketQuantityError();
  if (event.requireCourse && !participant.course) throw new InvalidTicketQuantityError();
  if (event.requireCampus && !participant.campus) throw new InvalidTicketQuantityError();
}

function buildReservationFingerprint(input: {
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

function expiresAtFrom(now: Date) {
  return new Date(now.getTime() + EVENT_TICKET_RESERVATION_MINUTES * 60_000);
}

function groupParticipantsByLot(participants: Array<{ ticketLotId: string }>) {
  return participants.reduce((map, participant) => {
    map.set(participant.ticketLotId, (map.get(participant.ticketLotId) ?? 0) + 1);
    return map;
  }, new Map<string, number>());
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

    if (input.participants.length < 1 || input.participants.length > event.maxTicketsPerOrder) {
      throw new InvalidTicketQuantityError();
    }

    let lot: ReturnType<typeof selectActiveTicketLot>;

    try {
      lot = selectActiveTicketLot(event.lots, now);
    } catch (error) {
      if (error instanceof NoActiveTicketLotError) {
        throw new InsufficientTicketAvailabilityError();
      }

      throw error;
    }

    const participants = input.participants.map(normalizeParticipant);
    const participantCpfHashes = participants.map((participant) => participant.cpfHash);

    if (new Set(participantCpfHashes).size !== participantCpfHashes.length) {
      throw new InvalidTicketQuantityError();
    }

    for (const participant of participants) {
      assertRequiredParticipantFields(event, participant);
    }

    const buyerCpf = input.buyer.cpf ? onlyDigits(input.buyer.cpf) : null;
    if (buyerCpf && !isValidCpf(buyerCpf)) {
      throw new InvalidTicketQuantityError();
    }

    const buyerEmail = normalizeEmail(input.buyer.email);
    const buyerPhone = normalizePhone(input.buyer.phone);

    if (!buyerEmail || !buyerPhone) {
      throw new InvalidTicketQuantityError();
    }

    const normalizedPartnerCode = input.partnerCode ? normalizePartnerCode(input.partnerCode) : null;
    const fingerprint = buildReservationFingerprint({
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
        if (existing.payloadFingerprint !== fingerprint) {
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

    await reserveLotTickets(tx, lot.id, participants.length);

    if (partnerCode) {
      await reservePartnerCodeUse(tx, partnerCode.id);
    }

    const subtotal = multiplyMoney(lot.price, participants.length);
    const discountAmount = calculatePartnerDiscount(partnerCode, subtotal);
    const total = toMoney(subtotal.minus(discountAmount));
    const orderId = crypto.randomUUID();
    const externalReference = `event_order:${orderId}`;
    const accessToken = secureToken();

    const order = await tx.eventOrder.create({
      data: {
        id: orderId,
        eventId: event.id,
        buyerName: sanitizeText(input.buyer.name),
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

  for (const [lotId, quantity] of groupParticipantsByLot(order.participants)) {
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

    for (const [lotId, quantity] of groupParticipantsByLot(order.participants)) {
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

    for (const [lotId, quantity] of groupParticipantsByLot(order.participants)) {
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
