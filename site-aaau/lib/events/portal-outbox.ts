import { EmailDeliveryKind, EventTicketPortalOutboxStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { sendTrackedEmail, type TrackedEmailInput } from "@/lib/email/delivery";
import {
  decryptPortalEmailPayload,
  encryptPortalEmailPayload,
  type PortalEmailPayload,
} from "@/lib/events/portal-security";
import type { EventTx } from "@/lib/events/types";

const PROCESSING_LEASE_MS = 5 * 60_000;
export const EVENT_TICKET_PORTAL_OUTBOX_MAX_ATTEMPTS = 8;

export async function queuePortalAccessEmail(tx: EventTx, input: {
  portalSessionId: string;
  recipient: string;
  expiresAt: Date;
  accessUrl: string;
  now: Date;
}) {
  const subject = "Acesse seus ingressos AAAU";
  const text = [
    subject,
    "Recebemos uma solicitação para consultar seus ingressos.",
    `O link pessoal expira em ${input.expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
    `Acessar meus ingressos: ${input.accessUrl}`,
    "Se você não fez esta solicitação, ignore este e-mail.",
  ].join("\n\n");
  const payload: PortalEmailPayload = {
    subject,
    text,
    html: `<!doctype html><html><body><h1>Acesse seus ingressos AAAU</h1><p>Recebemos uma solicitação para consultar seus ingressos.</p><p>Este link é pessoal e expira em ${input.expiresAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p><p><a href="${input.accessUrl.replace(/[&<>"']/g, "")}">Acessar meus ingressos</a></p><p>Se você não fez esta solicitação, ignore este e-mail.</p></body></html>`,
  };
  const encrypted = encryptPortalEmailPayload(payload);
  return tx.eventTicketPortalOutbox.create({
    data: {
      portalSessionId: input.portalSessionId,
      idempotencyKey: `event-ticket-portal:${input.portalSessionId}:access`,
      recipient: input.recipient,
      ...encrypted,
      nextAttemptAt: input.now,
    },
  });
}

type PortalOutboxSender = (input: TrackedEmailInput) => Promise<unknown>;

export async function processEventTicketPortalOutbox(options: {
  limit?: number;
  now?: Date;
  sender?: PortalOutboxSender;
  ids?: string[];
} = {}) {
  if (options.sender && process.env.NODE_ENV !== "test") throw new Error("EVENT_TICKET_PORTAL_TEST_SENDER_FORBIDDEN");
  const now = options.now ?? new Date();
  const ids = options.ids ? [...new Set(options.ids)] : undefined;
  if (ids?.length === 0) return { processed: 0, sent: 0, failed: 0, exhausted: 0 };
  const candidates = await prisma.eventTicketPortalOutbox.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : {}),
      encryptedPayload: { not: null },
      attemptCount: { lt: EVENT_TICKET_PORTAL_OUTBOX_MAX_ATTEMPTS },
      OR: [
        { status: { in: [EventTicketPortalOutboxStatus.PENDING, EventTicketPortalOutboxStatus.FAILED] }, nextAttemptAt: { lte: now } },
        { status: EventTicketPortalOutboxStatus.PROCESSING, processingStartedAt: { lte: new Date(now.getTime() - PROCESSING_LEASE_MS) } },
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
    const claim = await prisma.eventTicketPortalOutbox.updateMany({
      where: { id: candidate.id, status: candidate.status, processingStartedAt: candidate.processingStartedAt },
      data: { status: "PROCESSING", processingStartedAt: now, attemptCount: { increment: 1 }, lastError: null },
    });
    if (claim.count !== 1) continue;
    try {
      if (!candidate.encryptedPayload || !candidate.initializationVector || !candidate.authenticationTag) {
        throw new Error("EVENT_TICKET_PORTAL_OUTBOX_PAYLOAD_MISSING");
      }
      const payload = decryptPortalEmailPayload({
        encryptedPayload: candidate.encryptedPayload,
        initializationVector: candidate.initializationVector,
        authenticationTag: candidate.authenticationTag,
      });
      const result = await sender({
        kind: EmailDeliveryKind.EVENT_TICKET_PORTAL_ACCESS,
        idempotencyKey: candidate.idempotencyKey,
        portalSessionId: candidate.portalSessionId,
        to: candidate.recipient,
        ...payload,
      });
      if (result && typeof result === "object" && "reason" in result &&
        (result.reason === "not_configured" || result.reason === "sending")) {
        throw new Error("EVENT_TICKET_PORTAL_EMAIL_NOT_ACCEPTED");
      }
      await prisma.eventTicketPortalOutbox.update({ where: { id: candidate.id }, data: {
        status: "SENT", sentAt: now, processingStartedAt: null,
        encryptedPayload: null, initializationVector: null, authenticationTag: null, lastError: null,
      } });
      sent += 1;
    } catch (error) {
      const attempts = candidate.attemptCount + 1;
      await prisma.eventTicketPortalOutbox.update({ where: { id: candidate.id }, data: {
        status: "FAILED", processingStartedAt: null,
        nextAttemptAt: new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 7))),
        lastError: `Falha de entrega (${error instanceof Error ? error.name : "UnknownError"})`,
      } });
      failed += 1;
      if (attempts >= EVENT_TICKET_PORTAL_OUTBOX_MAX_ATTEMPTS) exhausted += 1;
    }
  }
  return { processed: sent + failed, sent, failed, exhausted };
}

export async function processEventTicketPortalOutboxItems(input: {
  ids: string[];
  now?: Date;
  sender?: PortalOutboxSender;
}) {
  return processEventTicketPortalOutbox({
    ids: input.ids,
    limit: Math.max(input.ids.length, 1),
    now: input.now,
    sender: input.sender,
  });
}
