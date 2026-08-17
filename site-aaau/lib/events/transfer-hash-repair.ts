import { Prisma, PrismaClient } from "@prisma/client";

import {
  eventTicketTransferSecretFingerprint,
  hashEventTicketCodeWithSecret,
  hashEventTicketQrTokenWithSecret,
} from "@/lib/events/transfer-security";

const DEFAULT_BATCH_SIZE = 25;

const ticketHashStateSelect = {
  id: true,
  ownershipVersion: true,
  qrVersion: true,
  lastQrRotatedAt: true,
  transferredAt: true,
  originalOrderAccessRevokedAt: true,
  status: true,
  checkedInAt: true,
  qrToken: true,
  ticketCode: true,
  qrVersions: {
    select: {
      id: true,
      version: true,
      status: true,
      revokedAt: true,
      transferId: true,
      qrTokenHash: true,
      ticketCodeHash: true,
    },
  },
} satisfies Prisma.EventTicketSelect;

type TicketHashState = Prisma.EventTicketGetPayload<{ select: typeof ticketHashStateSelect }>;

export type EventTicketHashRepairMetrics = {
  total: number;
  activeVersions: number;
  validCredentialHashes: number;
  credentialHashMismatches: number;
  qrTokenHashMismatches: number;
  ticketCodeHashMismatches: number;
  inconsistentVersions: number;
  transferredTickets: number;
  legacyEligibleForRepair: number;
  legacyAlreadyCorrect: number;
  notAutomaticallyRepairable: number;
};

function classifyTicketHashState(ticket: TicketHashState, secret: string) {
  const activeVersions = ticket.qrVersions.filter((version) => version.status === "ACTIVE");
  const active = activeVersions.length === 1 ? activeVersions[0] : null;
  const structurallyConsistent = Boolean(active && active.version === ticket.qrVersion);
  const expectedQrTokenHash = hashEventTicketQrTokenWithSecret(ticket.qrToken, secret);
  const expectedTicketCodeHash = hashEventTicketCodeWithSecret(ticket.ticketCode, secret);
  const qrTokenHashMatches = structurallyConsistent && active!.qrTokenHash === expectedQrTokenHash;
  const ticketCodeHashMatches = structurallyConsistent && active!.ticketCodeHash === expectedTicketCodeHash;
  const credentialHashesMatch = qrTokenHashMatches && ticketCodeHashMatches;
  const legacyStructurallyEligible =
    ticket.ownershipVersion === 1 &&
    ticket.qrVersion === 1 &&
    ticket.lastQrRotatedAt === null &&
    ticket.transferredAt === null &&
    ticket.originalOrderAccessRevokedAt === null &&
    ticket.status === "VALID" &&
    ticket.checkedInAt === null &&
    activeVersions.length === 1 &&
    active?.version === 1 &&
    active.status === "ACTIVE" &&
    active.revokedAt === null &&
    active.transferId === null;

  return {
    active,
    activeVersionCount: activeVersions.length,
    structurallyConsistent,
    expectedQrTokenHash,
    expectedTicketCodeHash,
    qrTokenHashMatches,
    ticketCodeHashMatches,
    credentialHashesMatch,
    transferred: ticket.ownershipVersion > 1 || ticket.transferredAt !== null ||
      ticket.originalOrderAccessRevokedAt !== null || ticket.qrVersions.some((version) => version.transferId !== null),
    legacyStructurallyEligible,
    repairCandidate: legacyStructurallyEligible && !credentialHashesMatch,
  };
}

function emptyMetrics(): EventTicketHashRepairMetrics {
  return {
    total: 0,
    activeVersions: 0,
    validCredentialHashes: 0,
    credentialHashMismatches: 0,
    qrTokenHashMismatches: 0,
    ticketCodeHashMismatches: 0,
    inconsistentVersions: 0,
    transferredTickets: 0,
    legacyEligibleForRepair: 0,
    legacyAlreadyCorrect: 0,
    notAutomaticallyRepairable: 0,
  };
}

export async function verifyEventTicketCredentialHashes(input: {
  db: PrismaClient;
  secret: string;
  batchSize?: number;
}) {
  const metrics = emptyMetrics();
  const manualReviewTicketIds: string[] = [];
  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  let cursor: string | undefined;

  while (true) {
    const tickets = await input.db.eventTicket.findMany({
      select: ticketHashStateSelect,
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!tickets.length) break;

    for (const ticket of tickets) {
      const state = classifyTicketHashState(ticket, input.secret);
      metrics.total += 1;
      metrics.activeVersions += state.activeVersionCount;
      if (!state.structurallyConsistent) metrics.inconsistentVersions += 1;
      if (state.credentialHashesMatch) metrics.validCredentialHashes += 1;
      if (state.structurallyConsistent && !state.credentialHashesMatch) metrics.credentialHashMismatches += 1;
      if (state.structurallyConsistent && !state.qrTokenHashMatches) metrics.qrTokenHashMismatches += 1;
      if (state.structurallyConsistent && !state.ticketCodeHashMatches) metrics.ticketCodeHashMismatches += 1;
      if (state.transferred) metrics.transferredTickets += 1;
      if (state.repairCandidate) metrics.legacyEligibleForRepair += 1;
      if (state.legacyStructurallyEligible && state.credentialHashesMatch) metrics.legacyAlreadyCorrect += 1;
      if (!state.structurallyConsistent || (!state.credentialHashesMatch && !state.repairCandidate)) {
        metrics.notAutomaticallyRepairable += 1;
        manualReviewTicketIds.push(ticket.id);
      }
    }
    cursor = tickets.at(-1)?.id;
  }

  return {
    secretFingerprint: eventTicketTransferSecretFingerprint(input.secret),
    metrics,
    manualReviewTicketIds,
  };
}

export async function repairLegacyEventTicketCredentialHashes(input: {
  db: PrismaClient;
  secret: string;
  write?: boolean;
  batchSize?: number;
}) {
  const before = await verifyEventTicketCredentialHashes(input);
  if (before.metrics.inconsistentVersions > 0) {
    throw new Error("EVENT_TICKET_HASH_REPAIR_STRUCTURAL_INCONSISTENCY");
  }
  if (!input.write) {
    return { mode: "dry-run" as const, repaired: 0, wouldRepair: before.metrics.legacyEligibleForRepair, before, after: before };
  }

  const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
  let cursor: string | undefined;
  let repaired = 0;
  while (true) {
    const page = await input.db.eventTicket.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!page.length) break;
    const ids = page.map(({ id }) => id);
    repaired += await input.db.$transaction(async (tx) => {
      const tickets = await tx.eventTicket.findMany({
        where: { id: { in: ids } },
        select: ticketHashStateSelect,
        orderBy: { id: "asc" },
      });
      let batchRepaired = 0;
      for (const ticket of tickets) {
        const state = classifyTicketHashState(ticket, input.secret);
        if (!state.structurallyConsistent) {
          throw new Error("EVENT_TICKET_HASH_REPAIR_STRUCTURAL_INCONSISTENCY");
        }
        if (!state.repairCandidate || !state.active) continue;
        const changed = await tx.eventTicketQrVersion.updateMany({
          where: {
            id: state.active.id,
            ticketId: ticket.id,
            version: 1,
            status: "ACTIVE",
            revokedAt: null,
            transferId: null,
            qrTokenHash: state.active.qrTokenHash,
            ticketCodeHash: state.active.ticketCodeHash,
            ticket: {
              ownershipVersion: 1,
              qrVersion: 1,
              lastQrRotatedAt: null,
              transferredAt: null,
              originalOrderAccessRevokedAt: null,
              status: "VALID",
              checkedInAt: null,
            },
          },
          data: {
            qrTokenHash: state.expectedQrTokenHash,
            ticketCodeHash: state.expectedTicketCodeHash,
          },
        });
        if (changed.count !== 1) throw new Error("EVENT_TICKET_HASH_REPAIR_CONCURRENT_CHANGE");
        batchRepaired += 1;
      }
      return batchRepaired;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    cursor = page.at(-1)?.id;
  }

  const after = await verifyEventTicketCredentialHashes(input);
  if (after.metrics.legacyEligibleForRepair !== 0) {
    throw new Error("EVENT_TICKET_HASH_REPAIR_INCOMPLETE");
  }
  return { mode: "write" as const, repaired, wouldRepair: before.metrics.legacyEligibleForRepair, before, after };
}
