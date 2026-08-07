import { EventTicketTransferStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { assertEventTicketTransfersEnabled } from "@/lib/events/transfer-config";
import {
  generateEventTicketTransferToken,
  hashEventTicketAccessToken,
  hashEventTicketCode,
  hashEventTicketHolderEmail,
  hashEventTicketQrToken,
  normalizeEventTicketHolderEmail,
} from "@/lib/events/transfer-security";
import type { EventTx } from "@/lib/events/types";

type EventTransferDb = EventTx | typeof prisma;

export const PENDING_EVENT_TICKET_TRANSFER_STATUSES = [
  EventTicketTransferStatus.PENDING_CURRENT_CONFIRMATION,
  EventTicketTransferStatus.PENDING_RECIPIENT_ACCEPTANCE,
] as const;

export function eventTicketTransferIsExpired(
  transfer: { ticketId: string; status: EventTicketTransferStatus; expiresAt: Date },
  now = new Date(),
) {
  return PENDING_EVENT_TICKET_TRANSFER_STATUSES.includes(
    transfer.status as (typeof PENDING_EVENT_TICKET_TRANSFER_STATUSES)[number],
  ) && transfer.expiresAt <= now;
}

export async function findEventTicketTransfer(
  transferId: string,
  db: EventTransferDb = prisma,
) {
  return db.eventTicketTransfer.findUnique({ where: { id: transferId } });
}

export async function findPendingEventTicketTransfer(
  ticketId: string,
  now = new Date(),
  db: EventTransferDb = prisma,
) {
  return db.eventTicketTransfer.findFirst({
    where: {
      ticketId,
      status: { in: [...PENDING_EVENT_TICKET_TRANSFER_STATUSES] },
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function expirePendingEventTicketTransfers(
  ticketId: string,
  now = new Date(),
  db: EventTransferDb = prisma,
) {
  return db.eventTicketTransfer.updateMany({
    where: {
      ticketId,
      status: { in: [...PENDING_EVENT_TICKET_TRANSFER_STATUSES] },
      expiresAt: { lte: now },
    },
    data: {
      status: EventTicketTransferStatus.EXPIRED,
      expiredAt: now,
      currentHolderConfirmationTokenHash: null,
      recipientAcceptanceTokenHash: null,
    },
  });
}

export async function findActiveEventTicketAccessGrant(
  ticketId: string,
  now = new Date(),
  db: EventTransferDb = prisma,
) {
  return db.eventTicketAccessGrant.findFirst({
    where: {
      ticketId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { issuedAt: "desc" },
  });
}

export async function findActiveEventTicketAccessGrantsByHolderEmail(
  holderEmail: string,
  now = new Date(),
  db: EventTransferDb = prisma,
) {
  const holderEmailHash = hashEventTicketHolderEmail(holderEmail);
  return db.eventTicketAccessGrant.findMany({
    where: {
      holderEmailHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      ticketId: true,
      ownershipVersion: true,
      holderEmail: true,
      issuedAt: true,
      expiresAt: true,
      ticket: { select: { id: true, ownershipVersion: true } },
    },
    orderBy: { issuedAt: "desc" },
  });
}

export async function revokeActiveEventTicketAccessGrants(
  ticketId: string,
  revokedAt = new Date(),
  db: EventTransferDb = prisma,
) {
  return db.eventTicketAccessGrant.updateMany({
    where: { ticketId, revokedAt: null },
    data: { revokedAt },
  });
}

export async function findActiveEventTicketQrVersion(
  ticketId: string,
  db: EventTransferDb = prisma,
) {
  return db.eventTicketQrVersion.findFirst({
    where: { ticketId, status: "ACTIVE" },
    orderBy: { version: "desc" },
  });
}

export async function ensureInitialEventTicketQrVersion(
  ticketId: string,
  db: EventTransferDb = prisma,
) {
  const ticket = await db.eventTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      qrToken: true,
      ticketCode: true,
      issuedAt: true,
      qrVersions: { where: { version: 1 }, select: { id: true }, take: 1 },
    },
  });
  if (!ticket) throw new Error("EVENT_TICKET_NOT_FOUND");
  if (ticket.qrVersions[0]) {
    return db.eventTicketQrVersion.findUniqueOrThrow({
      where: { id: ticket.qrVersions[0].id },
    });
  }

  try {
    return await db.eventTicketQrVersion.create({
      data: {
        ticketId: ticket.id,
        version: 1,
        qrTokenHash: hashEventTicketQrToken(ticket.qrToken),
        ticketCodeHash: hashEventTicketCode(ticket.ticketCode),
        status: "ACTIVE",
        issuedAt: ticket.issuedAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.eventTicketQrVersion.findUniqueOrThrow({
        where: { ticketId_version: { ticketId, version: 1 } },
      });
    }
    throw error;
  }
}

export async function resolveEventTicketAccessGrant(
  rawToken: string,
  now = new Date(),
  db: EventTransferDb = prisma,
) {
  const tokenHash = hashEventTicketAccessToken(rawToken);
  const grant = await db.eventTicketAccessGrant.findUnique({
    where: { tokenHash },
    include: {
      ticket: {
        include: { event: true, lot: true },
      },
    },
  });

  if (!grant || grant.revokedAt || (grant.expiresAt && grant.expiresAt <= now)) return null;
  if (grant.ticket.ownershipVersion !== grant.ownershipVersion) return null;

  await db.eventTicketAccessGrant.update({
    where: { id: grant.id },
    data: { lastAccessAt: now },
  });

  return {
    grant: {
      id: grant.id,
      ticketId: grant.ticketId,
      ownershipVersion: grant.ownershipVersion,
      holderEmail: grant.holderEmail,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
    },
    ticket: grant.ticket,
  };
}

export async function createIndividualEventTicketAccessGrant(input: {
  ticketId: string;
  ownershipVersion: number;
  holderEmail: string;
  createdFromTransferId?: string | null;
  expiresAt?: Date | null;
  db?: EventTransferDb;
}) {
  assertEventTicketTransfersEnabled();
  const db = input.db ?? prisma;
  const ticket = await db.eventTicket.findUnique({
    where: { id: input.ticketId },
    select: { id: true, ownershipVersion: true },
  });
  if (!ticket || ticket.ownershipVersion !== input.ownershipVersion) {
    throw new Error("EVENT_TICKET_OWNERSHIP_VERSION_MISMATCH");
  }

  if (input.createdFromTransferId) {
    const transfer = await db.eventTicketTransfer.findFirst({
      where: { id: input.createdFromTransferId, ticketId: input.ticketId },
      select: { id: true },
    });
    if (!transfer) throw new Error("EVENT_TICKET_TRANSFER_TICKET_MISMATCH");
  }

  const now = new Date();
  await db.eventTicketAccessGrant.updateMany({
    where: {
      ticketId: input.ticketId,
      revokedAt: null,
      expiresAt: { lte: now },
    },
    data: { revokedAt: now },
  });

  const rawToken = generateEventTicketTransferToken();
  const holderEmail = normalizeEventTicketHolderEmail(input.holderEmail);
  const grant = await db.eventTicketAccessGrant.create({
    data: {
      ticketId: input.ticketId,
      ownershipVersion: input.ownershipVersion,
      holderEmail,
      holderEmailHash: hashEventTicketHolderEmail(holderEmail),
      tokenHash: hashEventTicketAccessToken(rawToken),
      createdFromTransferId: input.createdFromTransferId ?? null,
      expiresAt: input.expiresAt ?? null,
    },
  });

  return { grant, rawToken };
}

export async function createPendingEventTicketTransfer(input: {
  ticketId: string;
  toHolderName: string;
  toHolderEmail: string;
  expiresAt: Date;
  initiatedByAdminUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
  db?: EventTransferDb;
}) {
  assertEventTicketTransfersEnabled();
  const db = input.db ?? prisma;
  const ticket = await db.eventTicket.findUnique({ where: { id: input.ticketId } });
  if (!ticket) throw new Error("EVENT_TICKET_NOT_FOUND");
  await expirePendingEventTicketTransfers(input.ticketId, new Date(), db);
  if (await findPendingEventTicketTransfer(input.ticketId, new Date(), db)) {
    throw new Error("EVENT_TICKET_TRANSFER_CONFLICT");
  }

  const toHolderEmail = normalizeEventTicketHolderEmail(input.toHolderEmail);
  return db.eventTicketTransfer.create({
    data: {
      ticketId: ticket.id,
      fromOwnershipVersion: ticket.ownershipVersion,
      fromHolderName: ticket.participantName,
      fromHolderEmail: ticket.participantEmail,
      fromHolderEmailHash: ticket.participantEmail
        ? hashEventTicketHolderEmail(ticket.participantEmail)
        : null,
      toHolderName: input.toHolderName.trim(),
      toHolderEmail,
      toHolderEmailHash: hashEventTicketHolderEmail(toHolderEmail),
      expiresAt: input.expiresAt,
      initiatedByAdminUserId: input.initiatedByAdminUserId ?? null,
      metadata: input.metadata,
    },
  });
}
