import { EventTicketTransferStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { completeEventTicketTransfer } from "@/lib/events/transfer-completion";
import { safeEventTicketTransferErrorCode } from "@/lib/events/transfer-action-errors";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import { assertEventTicketTransfersEnabled } from "@/lib/events/transfer-config";
import {
  queueHolderConfirmationEmail,
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
import type { EventTicketTransferRecipientInput } from "@/lib/events/transfer-validation";

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

async function resolveHolder(tx: Parameters<Parameters<typeof runSerializableTransactionWithRetry>[0]>[0], input: {
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
      include: { event: true, lot: true, eventOrder: { select: { buyerEmail: true } } },
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
    include: { ticket: { include: { event: true, lot: true, eventOrder: { select: { buyerEmail: true } } } } },
  });
  if (
    !grant || grant.ticketId !== input.ticketId || grant.revokedAt ||
    (grant.expiresAt && grant.expiresAt <= input.now) ||
    grant.ownershipVersion !== grant.ticket.ownershipVersion
  ) flowError("EVENT_TICKET_TRANSFER_UNAUTHORIZED");
  return { ticket: grant.ticket, holderEmail: grant.holderEmail };
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
