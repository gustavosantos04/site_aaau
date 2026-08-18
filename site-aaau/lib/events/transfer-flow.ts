import { EventTicketTransferStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import {
  completeEventTicketTransfer,
  completeEventTicketTransferInTransaction,
  prepareEventTicketTransferCredentials,
} from "@/lib/events/transfer-completion";
import { TICKET_CODE_RETRY_LIMIT } from "@/lib/events/constants";
import { safeEventTicketTransferErrorCode } from "@/lib/events/transfer-action-errors";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import { assertEventTicketTransfersEnabled } from "@/lib/events/transfer-config";
import {
  queueHolderConfirmationEmail,
  prepareTransferCompletionEmails,
  queueRecipientInvitationEmail,
  queueTransferStatusEmail,
} from "@/lib/events/transfer-emails";
import {
  generateEventTicketTransferToken,
  hashEventTicketAccessToken,
  hashEventTicketHolderEmail,
  hashEventTicketTransferValue,
  normalizeEventTicketHolderEmail,
} from "@/lib/events/transfer-security";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";
import type { EventTx } from "@/lib/events/types";
import {
  normalizeDirectEventTicketTransferRecipient,
  type EventTicketTransferRecipientInput,
} from "@/lib/events/transfer-validation";

export const CURRENT_HOLDER_CONFIRMATION_TTL_MS = 30 * 60_000;
export const RECIPIENT_ACCEPTANCE_TTL_MS = 48 * 60 * 60_000;

export type TicketHolderCredential =
  | { kind: "ORIGINAL_ORDER"; orderAccessToken: string }
  | { kind: "INDIVIDUAL_GRANT"; grantToken: string }
  | { kind: "PORTAL_SESSION"; portalSessionId: string };

const emailSchema = z.string().trim().email().max(160);

function flowError(code: string): never {
  throw new Error(code);
}

function confirmationHash(token: string) {
  return hashEventTicketTransferValue("current-holder-confirmation", token.trim());
}

function acceptanceHash(token: string) {
  return hashEventTicketTransferValue("recipient-acceptance", token.trim());
}

async function expireStaleTransfer(id: string, now: Date) {
  await prisma.eventTicketTransfer.updateMany({
    where: {
      id,
      status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      expiredAt: now,
      currentHolderConfirmationTokenHash: null,
      recipientAcceptanceTokenHash: null,
    },
  });
}

async function resolveHolder(tx: EventTx, input: {
  ticketId: string;
  credential: TicketHolderCredential;
  now: Date;
}) {
  if (input.credential.kind === "ORIGINAL_ORDER") {
    const ticket = await tx.eventTicket.findFirst({
      where: {
        id: input.ticketId,
        originalOrderAccessRevokedAt: null,
        eventOrder: { accessToken: input.credential.orderAccessToken, status: "PAID" },
      },
      include: { event: true, lot: true, eventOrder: { select: { status: true, buyerEmail: true } } },
    });
    if (!ticket) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
    return { ticket, holderEmail: ticket.participantEmail ?? ticket.eventOrder.buyerEmail };
  }

  if (input.credential.kind === "PORTAL_SESSION") {
    const session = await tx.eventTicketPortalSession.findUnique({ where: { id: input.credential.portalSessionId } });
    if (!session || session.revokedAt || session.expiresAt <= input.now) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
    const ticket = await tx.eventTicket.findUnique({
      where: { id: input.ticketId },
      include: { event: true, lot: true, eventOrder: { select: { status: true, buyerEmail: true } } },
    });
    if (!ticket) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
    const originalAccess = !ticket.originalOrderAccessRevokedAt && ticket.eventOrder.status === "PAID" &&
      normalizeEventTicketHolderEmail(ticket.eventOrder.buyerEmail) === session.email;
    const grantAccess = await tx.eventTicketAccessGrant.findFirst({
      where: {
        ticketId: ticket.id, holderEmailHash: session.emailHash,
        ownershipVersion: ticket.ownershipVersion, revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
      },
      select: { holderEmail: true },
    });
    if (!originalAccess && !grantAccess) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
    return { ticket, holderEmail: originalAccess ? ticket.eventOrder.buyerEmail : grantAccess!.holderEmail };
  }

  const grant = await tx.eventTicketAccessGrant.findUnique({
    where: { tokenHash: hashEventTicketAccessToken(input.credential.grantToken) },
    include: { ticket: { include: { event: true, lot: true, eventOrder: { select: { status: true, buyerEmail: true } } } } },
  });
  if (
    !grant || grant.ticketId !== input.ticketId || grant.revokedAt ||
    (grant.expiresAt && grant.expiresAt <= input.now) ||
    grant.ownershipVersion !== grant.ticket.ownershipVersion
  ) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
  return { ticket: grant.ticket, holderEmail: grant.holderEmail };
}

function directTransferId(requestId: string) {
  const normalized = requestId.trim();
  if (!/^[a-zA-Z0-9_-]{16,160}$/.test(normalized)) {
    flowError("EVENT_TICKET_TRANSFER_IDEMPOTENCY_INVALID");
  }
  return `direct_${hashEventTicketTransferValue("direct-request", normalized).slice(0, 48)}`;
}

function uniqueConstraintFailure(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function completedDirectTransferRetry(input: {
  transferId: string;
  ticketId: string;
  portalSessionId: string;
  recipient: EventTicketTransferRecipientInput;
  now: Date;
}) {
  const transfer = await prisma.eventTicketTransfer.findUnique({
    where: { id: input.transferId },
    include: {
      ticket: { include: { event: true } },
      outboxMessages: { where: { status: { not: "SENT" } }, select: { id: true } },
    },
  });
  if (!transfer) return null;
  const session = await prisma.eventTicketPortalSession.findUnique({ where: { id: input.portalSessionId } });
  if (
    !session || session.revokedAt || session.expiresAt <= input.now ||
    session.emailHash !== transfer.fromHolderEmailHash
  ) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
  const recipient = normalizeDirectEventTicketTransferRecipient(input.recipient, transfer.ticket.event);
  if (
    transfer.ticketId !== input.ticketId || transfer.status !== "COMPLETED" ||
    transfer.toHolderName !== recipient.name || transfer.toHolderEmailHash !== hashEventTicketHolderEmail(recipient.email) ||
    transfer.toHolderCpfHash !== recipient.cpfHash
  ) flowError("EVENT_TICKET_TRANSFER_IDEMPOTENCY_CONFLICT");
  return {
    transferId: transfer.id,
    ticketId: transfer.ticketId,
    ownershipVersion: transfer.ticket.ownershipVersion,
    qrVersion: transfer.ticket.qrVersion,
    alreadyCompleted: true,
    outboxIds: transfer.outboxMessages.map((message) => message.id),
  };
}

export async function transferEventTicketDirectly(input: {
  ticketId: string;
  portalSessionId: string;
  requestId: string;
  recipient: EventTicketTransferRecipientInput;
  now?: Date;
}) {
  assertEventTicketTransfersEnabled();
  const now = input.now ?? new Date();
  const transferId = directTransferId(input.requestId);
  const retry = await completedDirectTransferRetry({ ...input, transferId, now });
  if (retry) return retry;

  const preflight = await resolveHolder(prisma, {
    ticketId: input.ticketId,
    credential: { kind: "PORTAL_SESSION", portalSessionId: input.portalSessionId },
    now,
  });
  const recipient = normalizeDirectEventTicketTransferRecipient(input.recipient, preflight.ticket.event);
  if (normalizeEventTicketHolderEmail(preflight.holderEmail) === recipient.email) {
    flowError("EVENT_TICKET_TRANSFER_SAME_HOLDER");
  }

  for (let attempt = 0; attempt < TICKET_CODE_RETRY_LIMIT; attempt += 1) {
    const credentials = prepareEventTicketTransferCredentials();
    const preparedOutbox = prepareTransferCompletionEmails({
      transferId,
      eventName: preflight.ticket.event.name,
      newHolderEmail: recipient.email,
      previousHolderEmail: preflight.holderEmail,
      rawGrantToken: credentials.rawAccessToken,
      qrToken: credentials.qrToken,
      ticketCode: credentials.ticketCode,
      completedAt: now,
    });
    try {
      const result = await runSerializableTransactionWithRetry(async (tx) => {
        const holder = await resolveHolder(tx, {
          ticketId: input.ticketId,
          credential: { kind: "PORTAL_SESSION", portalSessionId: input.portalSessionId },
          now,
        });
        const authoritativeRecipient = normalizeDirectEventTicketTransferRecipient(input.recipient, holder.ticket.event);
        if (
          normalizeEventTicketHolderEmail(holder.holderEmail) !== normalizeEventTicketHolderEmail(preflight.holderEmail) ||
          authoritativeRecipient.email !== recipient.email || authoritativeRecipient.cpfHash !== recipient.cpfHash ||
          authoritativeRecipient.name !== recipient.name
        ) flowError("EVENT_TICKET_TRANSFER_CONFLICT");
        if (holder.ticket.status !== "VALID" || holder.ticket.checkedInAt || holder.ticket.eventOrder.status !== "PAID") {
          flowError("EVENT_TICKET_TRANSFER_TICKET_INVALID");
        }

        await tx.eventTicketTransfer.updateMany({
          where: {
            ticketId: holder.ticket.id,
            status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
          },
          data: {
            status: "EXPIRED",
            expiredAt: now,
            currentHolderConfirmationTokenHash: null,
            recipientAcceptanceTokenHash: null,
          },
        });
        await tx.eventTicketTransfer.create({
          data: {
            id: transferId,
            ticketId: holder.ticket.id,
            status: "PENDING_CURRENT_CONFIRMATION",
            fromOwnershipVersion: holder.ticket.ownershipVersion,
            fromHolderName: holder.ticket.participantName,
            fromHolderEmail: holder.holderEmail,
            fromHolderEmailHash: hashEventTicketHolderEmail(holder.holderEmail),
            toHolderName: recipient.name,
            toHolderEmail: recipient.email,
            toHolderEmailHash: hashEventTicketHolderEmail(recipient.email),
            toHolderCpfHash: recipient.cpfHash,
            toHolderCpfLast4: recipient.cpfLast4,
            toHolderPhone: recipient.phone,
            currentHolderConfirmedAt: now,
            expiresAt: new Date(now.getTime() + CURRENT_HOLDER_CONFIRMATION_TTL_MS),
            metadata: { flow: "DIRECT", confirmedBy: "CURRENT_HOLDER" },
          },
        });
        return completeEventTicketTransferInTransaction(tx, {
          transferId,
          ticketId: holder.ticket.id,
          expectedOwnershipVersion: holder.ticket.ownershipVersion,
          recipient: input.recipient,
          now,
          direct: true,
          preparedCredentials: credentials,
          preparedOutbox,
        }, now);
      });
      logEventTicketOperation("transfer.completed", { transferId });
      return { ...result, transferId };
    } catch (error) {
      const completed = await completedDirectTransferRetry({ ...input, transferId, now });
      if (completed) return completed;
      if (!uniqueConstraintFailure(error) || attempt === TICKET_CODE_RETRY_LIMIT - 1) throw error;
    }
  }
  flowError("EVENT_TICKET_TRANSFER_CREDENTIAL_GENERATION_FAILED");
}

export async function requestEventTicketTransfer(input: {
  ticketId: string;
  holderCredential: TicketHolderCredential;
  recipientEmail: string;
  now?: Date;
}) {
  assertEventTicketTransfersEnabled();
  const now = input.now ?? new Date();
  const recipientEmail = normalizeEventTicketHolderEmail(emailSchema.parse(input.recipientEmail));

  return runSerializableTransactionWithRetry(async (tx) => {
    const holder = await resolveHolder(tx, { ticketId: input.ticketId, credential: input.holderCredential, now });
    const ticket = holder.ticket;
    if (ticket.status !== "VALID" || ticket.checkedInAt) flowError("EVENT_TICKET_TRANSFER_TICKET_INVALID");
    if (normalizeEventTicketHolderEmail(holder.holderEmail) === recipientEmail) {
      flowError("EVENT_TICKET_TRANSFER_SAME_HOLDER");
    }

    await tx.eventTicketTransfer.updateMany({
      where: {
        ticketId: ticket.id,
        status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
        expiresAt: { lte: now },
      },
      data: {
        status: "EXPIRED",
        expiredAt: now,
        currentHolderConfirmationTokenHash: null,
        recipientAcceptanceTokenHash: null,
      },
    });
    const pending = await tx.eventTicketTransfer.findFirst({
      where: {
        ticketId: ticket.id,
        status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
        expiresAt: { gt: now },
      },
    });
    if (pending) {
      if (pending.toHolderEmail === recipientEmail && pending.fromOwnershipVersion === ticket.ownershipVersion) {
        return { transferId: pending.id, created: false, rawConfirmationToken: null, outboxIds: [] as string[] };
      }
      flowError("EVENT_TICKET_TRANSFER_CONFLICT");
    }

    const rawConfirmationToken = generateEventTicketTransferToken();
    const expiresAt = new Date(now.getTime() + CURRENT_HOLDER_CONFIRMATION_TTL_MS);
    const transfer = await tx.eventTicketTransfer.create({
      data: {
        ticketId: ticket.id,
        fromOwnershipVersion: ticket.ownershipVersion,
        fromHolderName: ticket.participantName,
        fromHolderEmail: holder.holderEmail,
        fromHolderEmailHash: hashEventTicketHolderEmail(holder.holderEmail),
        toHolderName: "Pendente de aceite",
        toHolderEmail: recipientEmail,
        toHolderEmailHash: hashEventTicketHolderEmail(recipientEmail),
        currentHolderConfirmationTokenHash: confirmationHash(rawConfirmationToken),
        expiresAt,
      },
    });
    const outbox = await queueHolderConfirmationEmail(tx, {
      transferId: transfer.id,
      eventName: ticket.event.name,
      ticketLabel: ticket.lot.name,
      expiresAt,
      holderEmail: holder.holderEmail,
      recipientEmail,
      rawToken: rawConfirmationToken,
      now,
    });
    return { transferId: transfer.id, created: true, rawConfirmationToken, outboxIds: [outbox.id] };
  });
}

const publicSelect = {
  id: true,
  status: true,
  expiresAt: true,
  fromHolderName: true,
  toHolderEmail: true,
  ticket: {
    select: {
      participantName: true,
      lot: { select: { name: true } },
      event: { select: {
        name: true, startAt: true, venueName: true, venueAddress: true,
        requireParticipantEmail: true, requireParticipantPhone: true, requireBirthDate: true,
        requireInstitution: true, requireCourse: true, requireCampus: true, minimumAge: true,
      } },
    },
  },
} as const;

export async function getHolderConfirmationView(rawToken: string, now = new Date()) {
  const transfer = await prisma.eventTicketTransfer.findUnique({
    where: { currentHolderConfirmationTokenHash: confirmationHash(rawToken) },
    select: publicSelect,
  });
  if (!transfer) return { state: "INVALID" as const };
  if (transfer.expiresAt <= now || transfer.status === "EXPIRED") return { state: "EXPIRED" as const };
  if (!["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"].includes(transfer.status)) {
    return { state: "INVALID" as const };
  }
  return { state: transfer.status === "PENDING_RECIPIENT_ACCEPTANCE" ? "CONFIRMED" as const : "READY" as const, transfer };
}

export async function confirmEventTicketTransfer(rawToken: string, now = new Date()) {
  assertEventTicketTransfersEnabled();
  const result = await runSerializableTransactionWithRetry(async (tx) => {
    const transfer = await tx.eventTicketTransfer.findUnique({
      where: { currentHolderConfirmationTokenHash: confirmationHash(rawToken) },
      include: { ticket: { include: { event: true, lot: true } } },
    });
    if (!transfer) flowError("EVENT_TICKET_TRANSFER_INVALID_TOKEN");
    if (transfer.expiresAt <= now) {
      await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
        status: "EXPIRED", expiredAt: now, currentHolderConfirmationTokenHash: null, recipientAcceptanceTokenHash: null,
      } });
      return { expired: true as const, outboxIds: [] as string[] };
    }
    if (transfer.status === "PENDING_RECIPIENT_ACCEPTANCE") {
      return { transferId: transfer.id, alreadyConfirmed: true, expired: false as const, outboxIds: [] as string[] };
    }
    if (transfer.status !== "PENDING_CURRENT_CONFIRMATION") flowError("EVENT_TICKET_TRANSFER_INVALID_STATUS");
    const rawAcceptanceToken = generateEventTicketTransferToken();
    const expiresAt = new Date(now.getTime() + RECIPIENT_ACCEPTANCE_TTL_MS);
    await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
      status: "PENDING_RECIPIENT_ACCEPTANCE",
      currentHolderConfirmedAt: now,
      recipientAcceptanceTokenHash: acceptanceHash(rawAcceptanceToken),
      expiresAt,
    } });
    const outbox = await queueRecipientInvitationEmail(tx, {
      transferId: transfer.id,
      eventName: transfer.ticket.event.name,
      ticketLabel: transfer.ticket.lot.name,
      expiresAt,
      recipientEmail: transfer.toHolderEmail,
      rawToken: rawAcceptanceToken,
      now,
    });
    return { transferId: transfer.id, alreadyConfirmed: false, expired: false as const, outboxIds: [outbox.id] };
  });
  if (result.expired) flowError("EVENT_TICKET_TRANSFER_EXPIRED");
  return result;
}

export async function getRecipientAcceptanceView(rawToken: string, now = new Date()) {
  const transfer = await prisma.eventTicketTransfer.findUnique({
    where: { recipientAcceptanceTokenHash: acceptanceHash(rawToken) },
    select: publicSelect,
  });
  if (!transfer) return { state: "INVALID" as const };
  if (transfer.expiresAt <= now || transfer.status === "EXPIRED") return { state: "EXPIRED" as const };
  if (transfer.status !== "PENDING_RECIPIENT_ACCEPTANCE") return { state: "INVALID" as const };
  return { state: "READY" as const, transfer };
}

export async function acceptEventTicketTransfer(rawToken: string, recipient: Omit<EventTicketTransferRecipientInput, "email">, now = new Date()) {
  assertEventTicketTransfersEnabled();
  const prepared = await runSerializableTransactionWithRetry(async (tx) => {
    const transfer = await tx.eventTicketTransfer.findUnique({
      where: { recipientAcceptanceTokenHash: acceptanceHash(rawToken) },
      include: { ticket: { select: { id: true, ownershipVersion: true } } },
    });
    if (!transfer) flowError("EVENT_TICKET_TRANSFER_INVALID_TOKEN");
    if (transfer.expiresAt <= now) {
      await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
        status: "EXPIRED", expiredAt: now, currentHolderConfirmationTokenHash: null, recipientAcceptanceTokenHash: null,
      } });
      return { expired: true as const };
    }
    if (transfer.status !== "PENDING_RECIPIENT_ACCEPTANCE" || !transfer.currentHolderConfirmedAt) {
      flowError("EVENT_TICKET_TRANSFER_INVALID_STATUS");
    }
    await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
      recipientConfirmedAt: now,
      toHolderName: recipient.name.trim(),
    } });
    return {
      expired: false as const,
      transferId: transfer.id,
      ticketId: transfer.ticketId,
      expectedOwnershipVersion: transfer.fromOwnershipVersion,
      recipient: { ...recipient, email: transfer.toHolderEmail },
    };
  });
  if (prepared.expired) flowError("EVENT_TICKET_TRANSFER_EXPIRED");
  logEventTicketOperation("transfer.recipient_accepted", { transferId: prepared.transferId });
  try {
    return await completeEventTicketTransfer({ ...prepared, now, queueCompletionEmails: true });
  } catch (error) {
    logEventTicketOperation("transfer.completion_failed", {
      transferId: prepared.transferId,
      stage: "completion",
      code: safeEventTicketTransferErrorCode(error),
    });
    throw error;
  }
}

export async function rejectEventTicketTransfer(rawToken: string, now = new Date()) {
  assertEventTicketTransfersEnabled();
  return runSerializableTransactionWithRetry(async (tx) => {
    const transfer = await tx.eventTicketTransfer.findUnique({
      where: { recipientAcceptanceTokenHash: acceptanceHash(rawToken) },
      include: { ticket: { select: { participantEmail: true, eventOrder: { select: { buyerEmail: true } }, event: { select: { name: true } } } } },
    });
    if (!transfer || transfer.expiresAt <= now || transfer.status !== "PENDING_RECIPIENT_ACCEPTANCE") {
      flowError("EVENT_TICKET_TRANSFER_INVALID_TOKEN");
    }
    await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
      status: "REJECTED", rejectedAt: now, currentHolderConfirmationTokenHash: null, recipientAcceptanceTokenHash: null,
    } });
    const holderEmail = transfer.fromHolderEmail ?? transfer.ticket.participantEmail ?? transfer.ticket.eventOrder.buyerEmail;
    const outbox = await queueTransferStatusEmail(tx, { transferId: transfer.id, kind: "REJECTED", recipient: holderEmail, eventName: transfer.ticket.event.name, now });
    return { transferId: transfer.id, outboxIds: [outbox.id] };
  });
}

export async function cancelEventTicketTransfer(rawConfirmationToken: string, now = new Date()) {
  assertEventTicketTransfersEnabled();
  return runSerializableTransactionWithRetry(async (tx) => {
    const transfer = await tx.eventTicketTransfer.findUnique({
      where: { currentHolderConfirmationTokenHash: confirmationHash(rawConfirmationToken) },
      include: { ticket: { select: { event: { select: { name: true } } } } },
    });
    const cancelableStatuses: EventTicketTransferStatus[] = [
      EventTicketTransferStatus.PENDING_CURRENT_CONFIRMATION,
      EventTicketTransferStatus.PENDING_RECIPIENT_ACCEPTANCE,
    ];
    if (!transfer || transfer.expiresAt <= now || !cancelableStatuses.includes(transfer.status)) flowError("EVENT_TICKET_TRANSFER_INVALID_TOKEN");
    await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
      status: "CANCELED", canceledAt: now, currentHolderConfirmationTokenHash: null, recipientAcceptanceTokenHash: null,
    } });
    const outbox = transfer.status === "PENDING_RECIPIENT_ACCEPTANCE"
      ? await queueTransferStatusEmail(tx, { transferId: transfer.id, kind: "CANCELED", recipient: transfer.toHolderEmail, eventName: transfer.ticket.event.name, now })
      : null;
    return { transferId: transfer.id, outboxIds: outbox ? [outbox.id] : [] };
  });
}

export async function cancelEventTicketTransferByHolder(input: {
  ticketId: string;
  holderCredential: TicketHolderCredential;
  now?: Date;
}) {
  assertEventTicketTransfersEnabled();
  const now = input.now ?? new Date();
  return runSerializableTransactionWithRetry(async (tx) => {
    const holder = await resolveHolder(tx, { ticketId: input.ticketId, credential: input.holderCredential, now });
    const transfer = await tx.eventTicketTransfer.findFirst({
      where: {
        ticketId: holder.ticket.id,
        status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
        expiresAt: { gt: now },
      },
      include: { ticket: { select: { event: { select: { name: true } } } } },
    });
    if (!transfer) flowError("EVENT_TICKET_TRANSFER_INVALID_STATUS");
    await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
      status: "CANCELED", canceledAt: now,
      currentHolderConfirmationTokenHash: null, recipientAcceptanceTokenHash: null,
    } });
    const outbox = transfer.status === "PENDING_RECIPIENT_ACCEPTANCE"
      ? await queueTransferStatusEmail(tx, {
        transferId: transfer.id, kind: "CANCELED", recipient: transfer.toHolderEmail,
        eventName: transfer.ticket.event.name, now,
      })
      : null;
    return { transferId: transfer.id, outboxIds: outbox ? [outbox.id] : [] };
  });
}

export async function resendEventTicketTransferEmail(input: {
  ticketId: string;
  holderCredential: TicketHolderCredential;
  now?: Date;
}) {
  assertEventTicketTransfersEnabled();
  const now = input.now ?? new Date();
  return runSerializableTransactionWithRetry(async (tx) => {
    const holder = await resolveHolder(tx, { ticketId: input.ticketId, credential: input.holderCredential, now });
    const transfer = await tx.eventTicketTransfer.findFirst({
      where: {
        ticketId: holder.ticket.id,
        status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
        expiresAt: { gt: now },
      },
      include: { ticket: { include: { event: true, lot: true } } },
    });
    if (!transfer) flowError("EVENT_TICKET_TRANSFER_INVALID_STATUS");
    const lastDelivery = await tx.eventTicketTransferOutbox.findFirst({
      where: { transferId: transfer.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
    });
    if (lastDelivery && lastDelivery.createdAt > new Date(now.getTime() - 5 * 60_000)) {
      flowError("EVENT_TICKET_TRANSFER_RESEND_COOLDOWN");
    }
    const rawToken = generateEventTicketTransferToken();
    const attempt = now.getTime().toString(36);
    const outbox = transfer.status === "PENDING_CURRENT_CONFIRMATION"
      ? await (async () => {
      const expiresAt = new Date(now.getTime() + CURRENT_HOLDER_CONFIRMATION_TTL_MS);
      await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
        currentHolderConfirmationTokenHash: confirmationHash(rawToken), expiresAt,
      } });
      return queueHolderConfirmationEmail(tx, {
        transferId: transfer.id, eventName: transfer.ticket.event.name, ticketLabel: transfer.ticket.lot.name,
        expiresAt, holderEmail: holder.holderEmail, recipientEmail: transfer.toHolderEmail,
        rawToken, deliveryAttempt: attempt, now,
      });
    })()
      : await (async () => {
      const expiresAt = new Date(now.getTime() + RECIPIENT_ACCEPTANCE_TTL_MS);
      await tx.eventTicketTransfer.update({ where: { id: transfer.id }, data: {
        recipientAcceptanceTokenHash: acceptanceHash(rawToken), expiresAt,
      } });
      return queueRecipientInvitationEmail(tx, {
        transferId: transfer.id, eventName: transfer.ticket.event.name, ticketLabel: transfer.ticket.lot.name,
        expiresAt, recipientEmail: transfer.toHolderEmail, rawToken, deliveryAttempt: attempt, now,
      });
    })();
    return { transferId: transfer.id, outboxIds: [outbox.id] };
  });
}

export async function markEventTicketTransferExpired(transferId: string, now = new Date()) {
  await expireStaleTransfer(transferId, now);
}

export async function expireEventTicketTransfers(now = new Date()) {
  return prisma.eventTicketTransfer.updateMany({
    where: {
      status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      expiredAt: now,
      currentHolderConfirmationTokenHash: null,
      recipientAcceptanceTokenHash: null,
    },
  });
}
