import { PrismaClient } from "@prisma/client";

import {
  repairLegacyEventTicketCredentialHashes,
  verifyEventTicketCredentialHashes,
} from "@/lib/events/transfer-hash-repair";
import { eventTicketTransferSecretFingerprint } from "@/lib/events/transfer-security";

const prisma = new PrismaClient();

function requiredRepairSecret() {
  const secret = process.env.EVENT_TICKET_TRANSFER_HASH_REPAIR_SECRET?.trim();
  if (!secret) throw new Error("Defina EVENT_TICKET_TRANSFER_HASH_REPAIR_SECRET explicitamente.");
  eventTicketTransferSecretFingerprint(secret);
  return secret;
}

function assertDatabaseTarget(write: boolean) {
  const target = process.env.EVENT_TICKET_TRANSFER_HASH_REPAIR_TARGET?.trim().toLowerCase();
  if (target !== "staging" && target !== "production") {
    throw new Error("Defina EVENT_TICKET_TRANSFER_HASH_REPAIR_TARGET como staging ou production.");
  }
  if (target === "production") {
    if (process.env.NODE_ENV !== "production") {
      throw new Error("Use NODE_ENV=production para verificar ou reparar producao.");
    }
    const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
    if (!rawDatabaseUrl) throw new Error("DATABASE_URL precisa estar configurada.");
    const hostname = new URL(rawDatabaseUrl).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      throw new Error("O alvo production nao pode usar banco local.");
    }
    if (write && process.env.EVENT_TICKET_TRANSFER_HASH_REPAIR_CONFIRM !== "REPAIR-PRODUCTION") {
      throw new Error("Confirme a escrita com EVENT_TICKET_TRANSFER_HASH_REPAIR_CONFIRM=REPAIR-PRODUCTION.");
    }
  } else {
    if (process.env.VERCEL_ENV === "production") {
      throw new Error("O reparo de staging nao pode executar em VERCEL_ENV=production.");
    }
    if (write && process.env.EVENT_TICKET_TRANSFER_HASH_REPAIR_CONFIRM !== "REPAIR-STAGING") {
      throw new Error("Confirme a escrita com EVENT_TICKET_TRANSFER_HASH_REPAIR_CONFIRM=REPAIR-STAGING.");
    }
  }
  return target;
}

function assertRuntimeFingerprintMatches(repairSecret: string, write: boolean) {
  const runtimeSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET?.trim();
  const repairSecretFingerprint = eventTicketTransferSecretFingerprint(repairSecret);
  const runtimeSecretFingerprint = runtimeSecret
    ? eventTicketTransferSecretFingerprint(runtimeSecret)
    : null;
  const fingerprintsMatch = runtimeSecretFingerprint === null
    ? null
    : runtimeSecretFingerprint === repairSecretFingerprint;
  if (write && fingerprintsMatch !== true) {
    throw new Error("EVENT_TICKET_HASH_REPAIR_RUNTIME_SECRET_FINGERPRINT_MISMATCH");
  }
  return { runtimeSecretFingerprint, repairSecretFingerprint, fingerprintsMatch };
}

async function main() {
  const mode = process.argv[2] ?? "verify";
  if (mode === "fingerprint") {
    const repairSecret = requiredRepairSecret();
    console.info(JSON.stringify({ mode, ...assertRuntimeFingerprintMatches(repairSecret, false) }));
    return;
  }
  if (mode !== "verify" && mode !== "repair") {
    throw new Error("Modo invalido. Use fingerprint, verify ou repair [--write].");
  }

  const write = mode === "repair" && process.argv.includes("--write");
  const target = assertDatabaseTarget(write);
  const secret = requiredRepairSecret();
  const fingerprints = assertRuntimeFingerprintMatches(secret, write);

  if (mode === "verify") {
    const result = await verifyEventTicketCredentialHashes({ db: prisma, secret });
    console.info(JSON.stringify({ mode: "verify", target, ...fingerprints, ...result }));
    if (result.metrics.inconsistentVersions || result.metrics.notAutomaticallyRepairable) process.exitCode = 1;
    return;
  }

  const result = await repairLegacyEventTicketCredentialHashes({ db: prisma, secret, write });
  console.info(JSON.stringify({ target, ...fingerprints, ...result }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "EVENT_TICKET_HASH_REPAIR_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
