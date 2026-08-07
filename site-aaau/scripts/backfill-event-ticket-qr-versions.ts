import { PrismaClient } from "@prisma/client";

import { ensureInitialEventTicketQrVersion } from "@/lib/events/transfer-foundation";
import { hashEventTicketCode, hashEventTicketQrToken } from "@/lib/events/transfer-security";

const BATCH_SIZE = 100;
const prisma = new PrismaClient();

function flagEnabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function assertBackfillTarget() {
  const target = process.env.EVENT_TICKET_TRANSFER_BACKFILL_TARGET?.trim().toLowerCase();
  if (target !== "staging" && target !== "production") {
    throw new Error("Defina EVENT_TICKET_TRANSFER_BACKFILL_TARGET como staging ou production.");
  }
  const expectedConfirmation = target === "production" ? "BACKFILL-PRODUCTION" : "BACKFILL-STAGING";
  if (process.env.EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM !== expectedConfirmation) {
    throw new Error(`Confirme explicitamente com EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM=${expectedConfirmation}.`);
  }
  if (flagEnabled("EVENT_TICKET_TRANSFERS_ENABLED") || flagEnabled("EVENT_TICKET_PORTAL_ENABLED")) {
    throw new Error("Desabilite transferencias e portal antes do backfill.");
  }
  if (target === "production") {
    if (process.env.NODE_ENV !== "production") throw new Error("Use NODE_ENV=production para o backfill de producao.");
    const raw = process.env.DATABASE_URL?.trim();
    if (!raw) throw new Error("DATABASE_URL precisa estar configurada.");
    const hostname = new URL(raw).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      throw new Error("O alvo production nao pode usar banco local.");
    }
  } else if (process.env.VERCEL_ENV === "production") {
    throw new Error("O backfill de staging nao pode executar em VERCEL_ENV=production.");
  }
  return target;
}

async function collectMetrics() {
  const [totalTickets, versionOne, activeVersions, missingVersionOne, missingActive, originalAccessRevoked] = await Promise.all([
    prisma.eventTicket.count(),
    prisma.eventTicketQrVersion.count({ where: { version: 1 } }),
    prisma.eventTicketQrVersion.count({ where: { status: "ACTIVE" } }),
    prisma.eventTicket.count({ where: { qrVersions: { none: { version: 1 } } } }),
    prisma.eventTicket.count({ where: { qrVersions: { none: { status: "ACTIVE" } } } }),
    prisma.eventTicket.count({ where: { originalOrderAccessRevokedAt: { not: null } } }),
  ]);
  let credentialHashMismatches = 0;
  let cursor: string | undefined;
  while (true) {
    const tickets = await prisma.eventTicket.findMany({
      where: { qrVersion: 1 },
      select: {
        id: true,
        qrToken: true,
        ticketCode: true,
        qrVersions: { where: { version: 1 }, select: { qrTokenHash: true, ticketCodeHash: true }, take: 1 },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!tickets.length) break;
    for (const ticket of tickets) {
      const version = ticket.qrVersions[0];
      if (!version || version.qrTokenHash !== hashEventTicketQrToken(ticket.qrToken) ||
        version.ticketCodeHash !== hashEventTicketCode(ticket.ticketCode)) {
        credentialHashMismatches += 1;
      }
    }
    cursor = tickets.at(-1)?.id;
  }
  return {
    totalTickets,
    versionOne,
    activeVersions,
    missingVersionOne,
    missingActive,
    originalAccessRevoked,
    credentialHashMismatches,
  };
}

async function backfillEventTicketQrVersions() {
  const target = assertBackfillTarget();
  const before = await collectMetrics();
  let cursor: string | undefined;
  let scanned = 0;
  let created = 0;
  let credentialChanges = 0;
  let updatedAtChanges = 0;

  while (true) {
    const tickets = await prisma.eventTicket.findMany({
      where: { qrVersions: { none: { version: 1 } } },
      select: { id: true, qrToken: true, ticketCode: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!tickets.length) break;
    scanned += tickets.length;
    for (const ticket of tickets) {
      await ensureInitialEventTicketQrVersion(ticket.id, prisma);
      const afterTicket = await prisma.eventTicket.findUniqueOrThrow({
        where: { id: ticket.id },
        select: { qrToken: true, ticketCode: true, updatedAt: true },
      });
      if (afterTicket.qrToken !== ticket.qrToken || afterTicket.ticketCode !== ticket.ticketCode) credentialChanges += 1;
      if (afterTicket.updatedAt.getTime() !== ticket.updatedAt.getTime()) updatedAtChanges += 1;
      created += 1;
    }
    cursor = tickets.at(-1)?.id;
  }

  const after = await collectMetrics();
  const result = { target, batchSize: BATCH_SIZE, scanned, created, credentialChanges, updatedAtChanges, before, after };
  console.info(JSON.stringify(result));
  if (after.missingVersionOne || after.missingActive || after.credentialHashMismatches ||
    credentialChanges || updatedAtChanges || before.originalAccessRevoked !== after.originalAccessRevoked) {
    process.exitCode = 1;
  }
}

async function verifyEventTicketQrVersions() {
  console.info(JSON.stringify({ mode: "verify", metrics: await collectMetrics() }));
}

const mode = process.argv[2] ?? "backfill";
(mode === "verify" ? verifyEventTicketQrVersions() : backfillEventTicketQrVersions())
  .catch((error) => {
    console.error(error instanceof Error ? error.name : "EventTicketBackfillError");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
