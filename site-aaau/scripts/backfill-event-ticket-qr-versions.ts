import { PrismaClient } from "@prisma/client";

import { initialEventTicketQrVersionData } from "@/lib/events/transfer-foundation";
import { eventTicketTransferSecretFingerprint, hashEventTicketCode, hashEventTicketQrToken } from "@/lib/events/transfer-security";

const BATCH_SIZE = 100;
const prisma = new PrismaClient();
const eligibleMissingVersionWhere = {
  qrVersion: 1,
  ownershipVersion: 1,
  status: "VALID" as const,
  checkedInAt: null,
  lastQrRotatedAt: null,
  transferredAt: null,
  originalOrderAccessRevokedAt: null,
  qrVersions: { none: {} },
};

function flagEnabled(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function requiredMatchingSecret() {
  const backfillSecret = process.env.EVENT_TICKET_TRANSFER_BACKFILL_SECRET?.trim();
  const runtimeSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET?.trim();
  if (!backfillSecret) throw new Error("Defina EVENT_TICKET_TRANSFER_BACKFILL_SECRET explicitamente.");
  if (!runtimeSecret) throw new Error("Defina EVENT_TICKET_TRANSFER_TOKEN_SECRET do runtime.");
  const backfillSecretFingerprint = eventTicketTransferSecretFingerprint(backfillSecret);
  const runtimeSecretFingerprint = eventTicketTransferSecretFingerprint(runtimeSecret);
  if (backfillSecretFingerprint !== runtimeSecretFingerprint) {
    throw new Error("EVENT_TICKET_TRANSFER_BACKFILL_SECRET_FINGERPRINT_MISMATCH");
  }
  return { backfillSecretFingerprint, runtimeSecretFingerprint };
}

function assertBackfillTarget(write: boolean) {
  const target = process.env.EVENT_TICKET_TRANSFER_BACKFILL_TARGET?.trim().toLowerCase();
  if (target !== "staging" && target !== "production") {
    throw new Error("Defina EVENT_TICKET_TRANSFER_BACKFILL_TARGET como staging ou production.");
  }
  if (flagEnabled("EVENT_TICKET_TRANSFERS_ENABLED") || flagEnabled("EVENT_TICKET_PORTAL_ENABLED")) {
    throw new Error("Desabilite transferencias e portal antes do backfill.");
  }
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) throw new Error("DATABASE_URL precisa estar configurada.");
  const hostname = new URL(raw).hostname.toLowerCase();
  if (target === "production") {
    if (process.env.NODE_ENV !== "production") throw new Error("Use NODE_ENV=production para producao.");
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.includes("-pooler")) {
      throw new Error("O backfill de producao exige conexao direta nao local.");
    }
    if (write && process.env.EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM !== "BACKFILL-PRODUCTION") {
      throw new Error("Confirme com EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM=BACKFILL-PRODUCTION.");
    }
  } else {
    if (process.env.VERCEL_ENV === "production") throw new Error("O backfill de staging nao pode executar em VERCEL_ENV=production.");
    if (write && process.env.EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM !== "BACKFILL-STAGING") {
      throw new Error("Confirme com EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM=BACKFILL-STAGING.");
    }
  }
  return target;
}

async function collectMetrics() {
  const [totalTickets, versionOne, activeVersions, missingVersionOne, missingActive, eligibleMissingVersions] = await Promise.all([
    prisma.eventTicket.count(),
    prisma.eventTicketQrVersion.count({ where: { version: 1 } }),
    prisma.eventTicketQrVersion.count({ where: { status: "ACTIVE" } }),
    prisma.eventTicket.count({ where: { qrVersions: { none: { version: 1 } } } }),
    prisma.eventTicket.count({ where: { qrVersions: { none: { status: "ACTIVE" } } } }),
    prisma.eventTicket.count({ where: eligibleMissingVersionWhere }),
  ]);
  let credentialHashMismatches = 0;
  let cursor: string | undefined;
  while (true) {
    const tickets = await prisma.eventTicket.findMany({
      where: { qrVersion: 1 },
      select: { id: true, qrToken: true, ticketCode: true, qrVersions: { where: { version: 1 }, select: { qrTokenHash: true, ticketCodeHash: true }, take: 1 } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!tickets.length) break;
    for (const ticket of tickets) {
      const version = ticket.qrVersions[0];
      if (!version || version.qrTokenHash !== hashEventTicketQrToken(ticket.qrToken) || version.ticketCodeHash !== hashEventTicketCode(ticket.ticketCode)) {
        credentialHashMismatches += 1;
      }
    }
    cursor = tickets.at(-1)?.id;
  }
  return { totalTickets, versionOne, activeVersions, missingVersionOne, missingActive, eligibleMissingVersions, credentialHashMismatches };
}

async function assertNoUnexpectedMissingVersions() {
  const unexpected = await prisma.eventTicket.findMany({
    where: { qrVersions: { none: {} }, NOT: eligibleMissingVersionWhere },
    select: { id: true },
    take: 11,
    orderBy: { id: "asc" },
  });
  if (unexpected.length) {
    throw new Error(`EVENT_TICKET_TRANSFER_BACKFILL_UNEXPECTED_MISSING_VERSIONS:${unexpected.slice(0, 10).map(({ id }) => id).join(",")}`);
  }
}

async function backfillEventTicketQrVersions(write: boolean) {
  const target = assertBackfillTarget(write);
  const fingerprints = requiredMatchingSecret();
  await assertNoUnexpectedMissingVersions();
  const before = await collectMetrics();
  if (!write) {
    console.info(JSON.stringify({ mode: "dry-run", target, ...fingerprints, wouldCreate: before.eligibleMissingVersions, metrics: before }));
    return;
  }
  let cursor: string | undefined;
  let created = 0;
  while (true) {
    const tickets = await prisma.eventTicket.findMany({
      where: eligibleMissingVersionWhere,
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!tickets.length) break;
    for (const candidate of tickets) {
      const didCreate = await prisma.$transaction(async (tx) => {
        const ticket = await tx.eventTicket.findFirst({
          where: { id: candidate.id, ...eligibleMissingVersionWhere },
          select: { id: true, qrToken: true, ticketCode: true, issuedAt: true },
        });
        if (!ticket) return false;
        await tx.eventTicketQrVersion.create({ data: initialEventTicketQrVersionData(ticket) });
        return true;
      });
      if (didCreate) created += 1;
    }
    cursor = tickets.at(-1)?.id;
  }
  const after = await collectMetrics();
  console.info(JSON.stringify({ mode: "write", target, ...fingerprints, created, before, after }));
  if (after.eligibleMissingVersions || after.missingVersionOne || after.missingActive) process.exitCode = 1;
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  if (mode === "verify") {
    console.info(JSON.stringify({ mode, metrics: await collectMetrics() }));
    return;
  }
  if (mode !== "backfill") throw new Error("Modo invalido. Use verify ou backfill [--write].");
  await backfillEventTicketQrVersions(process.argv.includes("--write"));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "EventTicketBackfillError");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
