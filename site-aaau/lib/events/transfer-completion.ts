import { EventTicketTransferStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { createEventAdminAuditLog } from "@/lib/events/audit";
import { TICKET_CODE_RETRY_LIMIT } from "@/lib/events/constants";
import { generateEventTicketCode, generateEventTicketQrToken } from "@/lib/events/tickets";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";
import { queueTransferCompletionEmails } from "@/lib/events/transfer-emails";
import { assertEventTicketTransfersEnabled } from "@/lib/events/transfer-config";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import {
  generateEventTicketTransferToken,
  hashEventTicketAccessToken,
  hashEventTicketCode,
  hashEventTicketHolderEmail,
  hashEventTicketQrToken,
  normalizeEventTicketHolderEmail,
} from "@/lib/events/transfer-security";
import {
  normalizeEventTicketTransferRecipient,
  type EventTicketTransferRecipientInput,
} from "@/lib/events/transfer-validation";
import type { EventTx } from "@/lib/events/types";

export type EventTicketTransferFailurePoint =
  | "AFTER_REVOKE_QR"
  | "AFTER_GENERATE_CREDENTIALS"
  | "AFTER_UPDATE_TICKET"
  | "AFTER_CREATE_QR_VERSION"
  | "AFTER_CREATE_GRANT"
  | "BEFORE_COMPLETE_TRANSFER";

type TestHooks = {
  failAt?: EventTicketTransferFailurePoint;
  generateQrToken?: () => string;
  generateTicketCode?: () => string;
  generateAccessToken?: () => string;
};

export type CompleteEventTicketTransferInput = {
  transferId: string;
  ticketId: string;
  expectedOwnershipVersion: number;
  recipient: EventTicketTransferRecipientInput;
  now?: Date;
  testHooks?: TestHooks;
  queueCompletionEmails?: boolean;
};

export type CompleteEventTicketTransferResult = {
  ticketId: string;
  ownershipVersion: number;
  qrVersion: number;
  alreadyCompleted: boolean;
  rawAccessToken: string | null;
  outboxIds: string[];
  delivery: {
    holderName: string;
    holderEmail: string;
    qrToken: string;
    ticketCode: string;
  };
};

const COMPLETABLE_STATUS = EventTicketTransferStatus.PENDING_RECIPIENT_ACCEPTANCE;

function transferError(code: string): never {
  throw new Error(code);
}

function assertTestHooksAllowed(hooks: TestHooks | undefined) {
  if (hooks && process.env.NODE_ENV !== "test") {
    transferError("EVENT_TICKET_TRANSFER_TEST_HOOKS_FORBIDDEN");
  }
}

function failAt(hooks: TestHooks | undefined, point: EventTicketTransferFailurePoint) {
  if (hooks?.failAt === point) throw new Error(`EVENT_TICKET_TRANSFER_TEST_FAILURE_${point}`);
}

function metadataObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.JsonObject
    : {};
}

function isCredentialCollision(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = JSON.stringify(error.meta?.target ?? "");
  return ["qrToken", "ticketCode", "tokenHash", "qrTokenHash", "ticketCodeHash"]
    .some((field) => target.includes(field));
}

async function generateUniqueCredentials(tx: EventTx, hooks: TestHooks | undefined) {
  for (let attempt = 0; attempt < TICKET_CODE_RETRY_LIMIT; attempt += 1) {
    const qrToken = hooks?.generateQrToken?.() ?? generateEventTicketQrToken();
    const ticketCode = hooks?.generateTicketCode?.() ?? generateEventTicketCode();
    const rawAccessToken = hooks?.generateAccessToken?.() ?? generateEventTicketTransferToken();
    const qrTokenHash = hashEventTicketQrToken(qrToken);
    const ticketCodeHash = hashEventTicketCode(ticketCode);
    const accessTokenHash = hashEventTicketAccessToken(rawAccessToken);

    const [ticketCollision, versionCollision, grantCollision] = await Promise.all([
      tx.eventTicket.findFirst({
        where: { OR: [{ qrToken }, { ticketCode }] },
        select: { id: true },
      }),
      tx.eventTicketQrVersion.findFirst({
        where: { OR: [{ qrTokenHash }, { ticketCodeHash }] },
        select: { id: true },
      }),
      tx.eventTicketAccessGrant.findUnique({
        where: { tokenHash: accessTokenHash },
        select: { id: true },
      }),
    ]);

    if (!ticketCollision && !versionCollision && !grantCollision) {
      return { qrToken, ticketCode, rawAccessToken, qrTokenHash, ticketCodeHash, accessTokenHash };
    }
  }
  transferError("EVENT_TICKET_TRANSFER_CREDENTIAL_GENERATION_FAILED");
}

function completedResult(input: CompleteEventTicketTransferInput, transfer: {
  ticketId: string;
  fromOwnershipVersion: number;
  toOwnershipVersion: number | null;
  toHolderName: string;
  toHolderEmail: string;
  ticket: {
    ownershipVersion: number;
    qrVersion: number;
    qrToken: string;
    ticketCode: string;
    participantName: string;
    participantCpfHash: string | null;
    participantEmail: string | null;
    participantPhone: string | null;
    birthDate: Date | null;
    institution: string | null;
    course: string | null;
    campus: string | null;
    event: {
      requireParticipantEmail: boolean;
      requireParticipantPhone: boolean;
      requireBirthDate: boolean;
      requireInstitution: boolean;
      requireCourse: boolean;
      requireCampus: boolean;
      minimumAge: number | null;
      startAt: Date;
    };
  };
}): CompleteEventTicketTransferResult {
  const recipient = normalizeEventTicketTransferRecipient(input.recipient, transfer.ticket.event);
  if (
    transfer.ticketId !== input.ticketId ||
    transfer.fromOwnershipVersion !== input.expectedOwnershipVersion ||
    transfer.toOwnershipVersion !== transfer.ticket.ownershipVersion ||
    transfer.toHolderName.trim() !== recipient.name ||
    normalizeEventTicketHolderEmail(transfer.toHolderEmail) !== recipient.email ||
    transfer.ticket.participantName !== recipient.name ||
    transfer.ticket.participantCpfHash !== recipient.cpfHash ||
    transfer.ticket.participantEmail !== recipient.email ||
    transfer.ticket.participantPhone !== recipient.phone ||
    transfer.ticket.birthDate?.getTime() !== recipient.birthDate?.getTime() ||
    transfer.ticket.institution !== recipient.institution ||
    transfer.ticket.course !== recipient.course ||
    transfer.ticket.campus !== recipient.campus
  ) {
    transferError("EVENT_TICKET_TRANSFER_IDEMPOTENCY_CONFLICT");
  }
  return {
    ticketId: transfer.ticketId,
    ownershipVersion: transfer.ticket.ownershipVersion,
    qrVersion: transfer.ticket.qrVersion,
    alreadyCompleted: true,
    rawAccessToken: null,
    outboxIds: [],
    delivery: {
      holderName: transfer.ticket.participantName,
      holderEmail: transfer.ticket.participantEmail!,
      qrToken: transfer.ticket.qrToken,
      ticketCode: transfer.ticket.ticketCode,
    },
  };
}

async function completeInTransaction(
  tx: EventTx,
  input: CompleteEventTicketTransferInput,
  now: Date,
): Promise<CompleteEventTicketTransferResult> {
  const transfer = await tx.eventTicketTransfer.findUnique({
    where: { id: input.transferId },
    include: {
      ticket: {
        include: {
          eventOrder: { select: { status: true, buyerEmail: true } },
          event: {
            select: {
              requireParticipantEmail: true,
              requireParticipantPhone: true,
              requireBirthDate: true,
              requireInstitution: true,
              requireCourse: true,
              requireCampus: true,
              minimumAge: true,
              startAt: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!transfer) transferError("EVENT_TICKET_TRANSFER_NOT_FOUND");
  if (transfer.ticketId !== input.ticketId) transferError("EVENT_TICKET_TRANSFER_TICKET_MISMATCH");
  if (transfer.status === EventTicketTransferStatus.COMPLETED) return completedResult(input, transfer);
  if (transfer.status !== COMPLETABLE_STATUS) transferError("EVENT_TICKET_TRANSFER_INVALID_STATUS");
  if (transfer.expiresAt <= now) transferError("EVENT_TICKET_TRANSFER_EXPIRED");
  if (!transfer.currentHolderConfirmedAt || !transfer.recipientConfirmedAt) {
    transferError("EVENT_TICKET_TRANSFER_CONFIRMATION_REQUIRED");
  }

  const ticket = transfer.ticket;
  if (ticket.eventOrder.status !== "PAID") transferError("EVENT_TICKET_TRANSFER_ORDER_NOT_PAID");
  if (ticket.status !== "VALID" || ticket.checkedInAt) transferError("EVENT_TICKET_TRANSFER_TICKET_INVALID");
  if (
    ticket.ownershipVersion !== input.expectedOwnershipVersion ||
    transfer.fromOwnershipVersion !== input.expectedOwnershipVersion
  ) {
    transferError("EVENT_TICKET_OWNERSHIP_VERSION_MISMATCH");
  }

  const otherPending = await tx.eventTicketTransfer.findFirst({
    where: {
      ticketId: input.ticketId,
      id: { not: transfer.id },
      status: { in: [
        EventTicketTransferStatus.PENDING_CURRENT_CONFIRMATION,
        EventTicketTransferStatus.PENDING_RECIPIENT_ACCEPTANCE,
      ] },
    },
    select: { id: true },
  });
  if (otherPending) transferError("EVENT_TICKET_TRANSFER_CONFLICT");

  const recipient = normalizeEventTicketTransferRecipient(input.recipient, ticket.event);
  if (
    recipient.name !== transfer.toHolderName.trim() ||
    recipient.email !== normalizeEventTicketHolderEmail(transfer.toHolderEmail) ||
    (transfer.toHolderCpfHash && transfer.toHolderCpfHash !== recipient.cpfHash)
  ) {
    transferError("EVENT_TICKET_TRANSFER_RECIPIENT_MISMATCH");
  }

  let activeQrVersion = await tx.eventTicketQrVersion.findFirst({
    where: { ticketId: ticket.id, status: "ACTIVE" },
  });
  if (!activeQrVersion) {
    activeQrVersion = await tx.eventTicketQrVersion.create({
      data: {
        ticketId: ticket.id,
        version: ticket.qrVersion,
        qrTokenHash: hashEventTicketQrToken(ticket.qrToken),
        ticketCodeHash: hashEventTicketCode(ticket.ticketCode),
        status: "ACTIVE",
        issuedAt: ticket.issuedAt,
      },
    });
  }
  if (
    activeQrVersion.version !== ticket.qrVersion ||
    activeQrVersion.qrTokenHash !== hashEventTicketQrToken(ticket.qrToken) ||
    activeQrVersion.ticketCodeHash !== hashEventTicketCode(ticket.ticketCode)
  ) {
    transferError("EVENT_TICKET_TRANSFER_QR_VERSION_INCONSISTENT");
  }

  const revoked = await tx.eventTicketQrVersion.updateMany({
    where: { id: activeQrVersion.id, ticketId: ticket.id, status: "ACTIVE" },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revocationReason: "TRANSFER_COMPLETED",
      transferId: transfer.id,
    },
  });
  if (revoked.count !== 1) transferError("EVENT_TICKET_TRANSFER_QR_VERSION_CONFLICT");
  failAt(input.testHooks, "AFTER_REVOKE_QR");

  await tx.eventTicketAccessGrant.updateMany({
    where: { ticketId: ticket.id, revokedAt: null },
    data: { revokedAt: now },
  });

  const credentials = await generateUniqueCredentials(tx, input.testHooks);
  failAt(input.testHooks, "AFTER_GENERATE_CREDENTIALS");
  const nextOwnershipVersion = ticket.ownershipVersion + 1;
  const nextQrVersion = ticket.qrVersion + 1;

  const updated = await tx.eventTicket.updateMany({
    where: {
      id: ticket.id,
      ownershipVersion: input.expectedOwnershipVersion,
      qrVersion: ticket.qrVersion,
      qrToken: ticket.qrToken,
      ticketCode: ticket.ticketCode,
      status: "VALID",
      checkedInAt: null,
      eventOrder: { status: "PAID" },
    },
    data: {
      participantName: recipient.name,
      participantCpf: recipient.cpf,
      participantCpfHash: recipient.cpfHash,
      participantCpfLast4: recipient.cpfLast4,
      participantEmail: recipient.email,
      participantPhone: recipient.phone,
      birthDate: recipient.birthDate,
      institution: recipient.institution,
      course: recipient.course,
      campus: recipient.campus,
      qrToken: credentials.qrToken,
      ticketCode: credentials.ticketCode,
      ownershipVersion: nextOwnershipVersion,
      qrVersion: nextQrVersion,
      transferredAt: now,
      lastQrRotatedAt: now,
      originalOrderAccessRevokedAt: now,
    },
  });
  if (updated.count !== 1) transferError("EVENT_TICKET_TRANSFER_CONFLICT");
  failAt(input.testHooks, "AFTER_UPDATE_TICKET");

  await tx.eventTicketQrVersion.create({
    data: {
      ticketId: ticket.id,
      version: nextQrVersion,
      qrTokenHash: credentials.qrTokenHash,
      ticketCodeHash: credentials.ticketCodeHash,
      status: "ACTIVE",
      issuedAt: now,
      transferId: transfer.id,
    },
  });
  failAt(input.testHooks, "AFTER_CREATE_QR_VERSION");

  await tx.eventTicketAccessGrant.create({
    data: {
      ticketId: ticket.id,
      ownershipVersion: nextOwnershipVersion,
      holderEmail: recipient.email,
      holderEmailHash: hashEventTicketHolderEmail(recipient.email),
      tokenHash: credentials.accessTokenHash,
      issuedAt: now,
      createdFromTransferId: transfer.id,
    },
  });
  failAt(input.testHooks, "AFTER_CREATE_GRANT");
  failAt(input.testHooks, "BEFORE_COMPLETE_TRANSFER");

  const completionMetadata: Prisma.InputJsonObject = {
    previousQrTokenHash: activeQrVersion.qrTokenHash,
    previousTicketCodeHash: activeQrVersion.ticketCodeHash,
    newQrTokenHash: credentials.qrTokenHash,
    newTicketCodeHash: credentials.ticketCodeHash,
    fromOwnershipVersion: ticket.ownershipVersion,
    toOwnershipVersion: nextOwnershipVersion,
    fromQrVersion: ticket.qrVersion,
    toQrVersion: nextQrVersion,
    completedAt: now.toISOString(),
  };
  const completed = await tx.eventTicketTransfer.updateMany({
    where: {
      id: transfer.id,
      ticketId: ticket.id,
      status: COMPLETABLE_STATUS,
      fromOwnershipVersion: input.expectedOwnershipVersion,
      completedAt: null,
    },
    data: {
      status: EventTicketTransferStatus.COMPLETED,
      completedAt: now,
      toOwnershipVersion: nextOwnershipVersion,
      toHolderCpfHash: recipient.cpfHash,
      toHolderCpfLast4: recipient.cpfLast4,
      toHolderPhone: recipient.phone,
      currentHolderConfirmationTokenHash: null,
      recipientAcceptanceTokenHash: null,
      metadata: { ...metadataObject(transfer.metadata), completion: completionMetadata },
    },
  });
  if (completed.count !== 1) transferError("EVENT_TICKET_TRANSFER_CONFLICT");

  await createEventAdminAuditLog(tx, {
    eventId: ticket.eventId,
    adminUserId: transfer.initiatedByAdminUserId,
    action: "EVENT_TICKET_TRANSFER_COMPLETED",
    targetType: "EventTicket",
    targetId: ticket.id,
    metadata: {
      transferId: transfer.id,
      fromOwnershipVersion: ticket.ownershipVersion,
      toOwnershipVersion: nextOwnershipVersion,
      fromQrVersion: ticket.qrVersion,
      toQrVersion: nextQrVersion,
      holderEmailHash: hashEventTicketHolderEmail(recipient.email),
    },
  });

  const completionOutbox = input.queueCompletionEmails
    ? await queueTransferCompletionEmails(tx, {
      transferId: transfer.id,
      eventName: ticket.event.name,
      newHolderEmail: recipient.email,
      previousHolderEmail: transfer.fromHolderEmail ?? ticket.eventOrder.buyerEmail,
      rawGrantToken: credentials.rawAccessToken,
      completedAt: now,
    })
    : [];

  return {
    ticketId: ticket.id,
    ownershipVersion: nextOwnershipVersion,
    qrVersion: nextQrVersion,
    alreadyCompleted: false,
    rawAccessToken: credentials.rawAccessToken,
    outboxIds: completionOutbox.flatMap((item) => item ? [item.id] : []),
    delivery: {
      holderName: recipient.name,
      holderEmail: recipient.email,
      qrToken: credentials.qrToken,
      ticketCode: credentials.ticketCode,
    },
  };
}

export async function completeEventTicketTransfer(input: CompleteEventTicketTransferInput) {
  assertEventTicketTransfersEnabled();
  assertTestHooksAllowed(input.testHooks);
  const now = input.now ?? new Date();

  for (let attempt = 0; attempt < TICKET_CODE_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await runSerializableTransactionWithRetry((tx) => completeInTransaction(tx, input, now));
      if (!result.alreadyCompleted) logEventTicketOperation("transfer.completed", { transferId: input.transferId });
      return result;
    } catch (error) {
      if (!isCredentialCollision(error) || attempt === TICKET_CODE_RETRY_LIMIT - 1) throw error;
    }
  }
  transferError("EVENT_TICKET_TRANSFER_CREDENTIAL_GENERATION_FAILED");
}
