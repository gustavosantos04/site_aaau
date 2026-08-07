import crypto from "node:crypto";
import {
  EmailDeliveryKind,
  EventTicketTransferOutboxStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { sendTrackedEmail, type TrackedEmailInput } from "@/lib/email/delivery";
import type { EventTx } from "@/lib/events/types";

const OUTBOX_PURPOSE = "event-ticket-transfer-outbox-v1";
const PROCESSING_LEASE_MS = 5 * 60_000;
export const EVENT_TICKET_OUTBOX_MAX_ATTEMPTS = 8;

export type TransferEmailPayload = Pick<TrackedEmailInput, "subject" | "text" | "html">;

function outboxKey() {
  const secret = process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("EVENT_TICKET_TRANSFER_OUTBOX_SECRET precisa ter pelo menos 32 caracteres.");
  }
  return crypto.createHash("sha256").update(OUTBOX_PURPOSE).update("\0").update(secret).digest();
}

export function encryptTransferEmailPayload(payload: TransferEmailPayload) {
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", outboxKey(), initializationVector);
  cipher.setAAD(Buffer.from(OUTBOX_PURPOSE));
  const encryptedPayload = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedPayload: encryptedPayload.toString("base64"),
    initializationVector: initializationVector.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptTransferEmailPayload(input: {
  encryptedPayload: string;
  initializationVector: string;
  authenticationTag: string;
}): TransferEmailPayload {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    outboxKey(),
    Buffer.from(input.initializationVector, "base64"),
  );
  decipher.setAAD(Buffer.from(OUTBOX_PURPOSE));
  decipher.setAuthTag(Buffer.from(input.authenticationTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.encryptedPayload, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (
    !parsed || typeof parsed !== "object" ||
    !("subject" in parsed) || !("text" in parsed) || !("html" in parsed) ||
    typeof parsed.subject !== "string" || typeof parsed.text !== "string" || typeof parsed.html !== "string"
  ) throw new Error("EVENT_TICKET_TRANSFER_OUTBOX_PAYLOAD_INVALID");
  return parsed as TransferEmailPayload;
}

export async function queueTransferEmail(tx: EventTx, input: {
  transferId: string;
  kind: EmailDeliveryKind;
  idempotencyKey: string;
  recipient: string;
  payload: TransferEmailPayload;
  now?: Date;
}) {
  const encrypted = encryptTransferEmailPayload(input.payload);
  return tx.eventTicketTransferOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      transferId: input.transferId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      recipient: input.recipient,
      ...encrypted,
      nextAttemptAt: input.now ?? new Date(),
    },
    update: {},
  });
}

function redactedDeliveryError(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return `Falha de entrega (${name})`.slice(0, 4000);
}

type OutboxSender = (input: TrackedEmailInput) => Promise<unknown>;

export async function processEventTicketTransferOutbox(options: {
  limit?: number;
  now?: Date;
  sender?: OutboxSender;
  ids?: string[];
} = {}) {
  if (options.sender && process.env.NODE_ENV !== "test") {
    throw new Error("EVENT_TICKET_TRANSFER_OUTBOX_TEST_SENDER_FORBIDDEN");
  }
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);
  const ids = options.ids ? [...new Set(options.ids)] : undefined;
  if (ids?.length === 0) return { processed: 0, sent: 0, failed: 0, exhausted: 0 };
  const candidates = await prisma.eventTicketTransferOutbox.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : {}),
      encryptedPayload: { not: null },
      attemptCount: { lt: EVENT_TICKET_OUTBOX_MAX_ATTEMPTS },
      OR: [
        { status: { in: [EventTicketTransferOutboxStatus.PENDING, EventTicketTransferOutboxStatus.FAILED] }, nextAttemptAt: { lte: now } },
        { status: EventTicketTransferOutboxStatus.PROCESSING, processingStartedAt: { lte: staleBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(options.limit ?? 20, 1), 100),
  });
  const sender = options.sender ?? sendTrackedEmail;
  let sent = 0;
  let failed = 0;
  let exhausted = 0;

  for (const candidate of candidates) {
    const claimed = await prisma.eventTicketTransferOutbox.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        processingStartedAt: candidate.processingStartedAt,
      },
      data: {
        status: EventTicketTransferOutboxStatus.PROCESSING,
        processingStartedAt: now,
        attemptCount: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) continue;

    try {
      if (!candidate.encryptedPayload || !candidate.initializationVector || !candidate.authenticationTag) {
        throw new Error("EVENT_TICKET_TRANSFER_OUTBOX_PAYLOAD_MISSING");
      }
      const payload = decryptTransferEmailPayload(candidate as {
        encryptedPayload: string;
        initializationVector: string;
        authenticationTag: string;
      });
      const deliveryResult = await sender({
        kind: candidate.kind,
        idempotencyKey: candidate.idempotencyKey,
        transferId: candidate.transferId,
        to: candidate.recipient,
        ...payload,
      });
      if (
        deliveryResult && typeof deliveryResult === "object" && "reason" in deliveryResult &&
        (deliveryResult.reason === "not_configured" || deliveryResult.reason === "sending")
      ) throw new Error("EVENT_TICKET_TRANSFER_EMAIL_NOT_ACCEPTED");
      await prisma.eventTicketTransferOutbox.update({
        where: { id: candidate.id },
        data: {
          status: EventTicketTransferOutboxStatus.SENT,
          sentAt: now,
          processingStartedAt: null,
          encryptedPayload: null,
          initializationVector: null,
          authenticationTag: null,
          lastError: null,
        },
      });
      sent += 1;
    } catch (error) {
      const attempt = candidate.attemptCount + 1;
      await prisma.eventTicketTransferOutbox.update({
        where: { id: candidate.id },
        data: {
          status: EventTicketTransferOutboxStatus.FAILED,
          processingStartedAt: null,
          nextAttemptAt: new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempt - 1, 7))),
          lastError: redactedDeliveryError(error),
        },
      });
      failed += 1;
      if (attempt >= EVENT_TICKET_OUTBOX_MAX_ATTEMPTS) exhausted += 1;
    }
  }
  return { processed: sent + failed, sent, failed, exhausted };
}

export async function processEventTicketTransferOutboxItems(input: {
  ids: string[];
  now?: Date;
  sender?: OutboxSender;
}) {
  return processEventTicketTransferOutbox({
    ids: input.ids,
    limit: Math.max(input.ids.length, 1),
    now: input.now,
    sender: input.sender,
  });
}
