import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { assertEventTicketPortalEnabled } from "@/lib/events/portal-config";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import { queuePortalAccessEmail } from "@/lib/events/portal-outbox";
import { consumePortalRateLimits } from "@/lib/events/portal-rate-limit";
import {
  generatePortalToken,
  hashPortalEmail,
  hashPortalMagicLinkToken,
  hashPortalSessionToken,
  normalizePortalEmail,
} from "@/lib/events/portal-security";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";
import { buildAbsoluteUrl } from "@/lib/site-url";

export const EVENT_TICKET_PORTAL_SESSION_TTL_MS = 60 * 60_000;
export const EVENT_TICKET_PORTAL_EMAIL_COOLDOWN_MS = 5 * 60_000;
const emailSchema = z.string().email().max(160);

async function portalHasContent(email: string, emailHash: string, now: Date) {
  const [order, grants, history] = await Promise.all([
    prisma.eventOrder.findFirst({
      where: {
        buyerEmail: { equals: email, mode: "insensitive" },
        status: { in: ["PAID", "CANCELED", "REFUNDED"] },
        tickets: { some: {} },
      },
      select: { id: true },
    }),
    prisma.eventTicketAccessGrant.findMany({
      where: {
        holderEmailHash: emailHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { ownershipVersion: true, ticket: { select: { ownershipVersion: true } } },
    }),
    prisma.eventTicketTransfer.findFirst({
      where: { fromHolderEmailHash: emailHash, status: "COMPLETED" },
      select: { id: true },
    }),
  ]);
  return Boolean(order || history || grants.some((grant) => grant.ownershipVersion === grant.ticket.ownershipVersion));
}

export async function requestEventTicketPortalAccess(input: {
  email: string;
  ip: string;
  now?: Date;
}) {
  assertEventTicketPortalEnabled();
  const now = input.now ?? new Date();
  const email = normalizePortalEmail(emailSchema.parse(normalizePortalEmail(input.email)));
  const emailHash = hashPortalEmail(email);
  const allowed = await consumePortalRateLimits({ action: "portal-access-request", ip: input.ip, emailHash, now });
  logEventTicketOperation("portal.access_requested");
  if (!allowed) {
    logEventTicketOperation("portal.access_limited", { reason: "rate_limited" });
    return { accepted: true as const, created: false };
  }
  if (!await portalHasContent(email, emailHash, now)) return { accepted: true as const, created: false };

  const recent = await prisma.eventTicketPortalSession.findFirst({
    where: { emailHash, createdAt: { gt: new Date(now.getTime() - EVENT_TICKET_PORTAL_EMAIL_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return { accepted: true as const, created: false };

  const rawMagicToken = generatePortalToken();
  const expiresAt = new Date(now.getTime() + EVENT_TICKET_PORTAL_SESSION_TTL_MS);
  const session = await runSerializableTransactionWithRetry(async (tx) => {
    const created = await tx.eventTicketPortalSession.create({
      data: { email, emailHash, magicLinkTokenHash: hashPortalMagicLinkToken(rawMagicToken), expiresAt },
    });
    const outbox = await queuePortalAccessEmail(tx, {
      portalSessionId: created.id,
      recipient: email,
      expiresAt,
      accessUrl: buildAbsoluteUrl(`/meus-ingressos/acesso/${rawMagicToken}`),
      now,
    });
    return { session: created, outboxId: outbox.id };
  });
  logEventTicketOperation("portal.session_created", { portalSessionId: session.session.id });
  return {
    accepted: true as const,
    created: true,
    sessionId: session.session.id,
    outboxId: session.outboxId,
    rawMagicToken,
  };
}

export async function exchangeEventTicketPortalMagicLink(input: {
  rawMagicToken: string;
  ip: string;
  now?: Date;
}) {
  assertEventTicketPortalEnabled();
  const now = input.now ?? new Date();
  const magicHash = hashPortalMagicLinkToken(input.rawMagicToken);
  const allowed = await consumePortalRateLimits({
    action: "portal-magic-link", ip: input.ip, tokenFingerprint: magicHash, limit: 12, now,
  });
  if (!allowed) {
    logEventTicketOperation("portal.magic_link_rejected", { reason: "rate_limited" });
    return null;
  }
  const rawSessionToken = generatePortalToken();
  const session = await runSerializableTransactionWithRetry(async (tx) => {
    const candidate = await tx.eventTicketPortalSession.findUnique({ where: { magicLinkTokenHash: magicHash } });
    if (!candidate || candidate.revokedAt || candidate.magicLinkConsumedAt || candidate.expiresAt <= now) return null;
    const updated = await tx.eventTicketPortalSession.updateMany({
      where: { id: candidate.id, magicLinkTokenHash: magicHash, magicLinkConsumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: {
        magicLinkTokenHash: null,
        magicLinkConsumedAt: now,
        sessionTokenHash: hashPortalSessionToken(rawSessionToken),
        lastAccessAt: now,
      },
    });
    return updated.count === 1 ? candidate : null;
  });
  if (!session) {
    logEventTicketOperation("portal.magic_link_rejected", { reason: "invalid" });
    return null;
  }
  logEventTicketOperation("portal.session_exchanged", { portalSessionId: session.id });
  return { sessionId: session.id, rawSessionToken, expiresAt: session.expiresAt };
}

export async function resolveEventTicketPortalSession(rawSessionToken: string, now = new Date(), recordAccess = true) {
  const session = await prisma.eventTicketPortalSession.findUnique({
    where: { sessionTokenHash: hashPortalSessionToken(rawSessionToken) },
    select: { id: true, email: true, emailHash: true, expiresAt: true, revokedAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  if (recordAccess) {
    await prisma.eventTicketPortalSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastAccessAt: now },
    });
  }
  return session;
}

export async function revokeEventTicketPortalSession(rawSessionToken: string, now = new Date()) {
  const result = await prisma.eventTicketPortalSession.updateMany({
    where: { sessionTokenHash: hashPortalSessionToken(rawSessionToken), revokedAt: null },
    data: { revokedAt: now, sessionTokenHash: null },
  });
  if (result.count) logEventTicketOperation("portal.session_revoked");
  return result;
}
