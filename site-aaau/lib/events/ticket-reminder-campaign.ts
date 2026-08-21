import {
  EmailDeliveryKind,
  EventTicketReminderCampaignStatus,
  EventTicketReminderDeliveryStatus,
  Prisma,
} from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { buildAaauTransactionalEmailHtml } from "@/lib/email/aaau-transactional-template";
import { sendTrackedEmail, type TrackedEmailInput } from "@/lib/email/delivery";
import {
  hashEventTicketCode,
  hashEventTicketQrToken,
  normalizeEventTicketHolderEmail,
} from "@/lib/events/transfer-security";
import { buildAbsoluteUrl } from "@/lib/site-url";

const emailSchema = z.string().trim().email().max(160);
const PROCESSING_LEASE_MS = 5 * 60_000;
export const EVENT_TICKET_REMINDER_MAX_ATTEMPTS = 5;

type ReminderSender = (input: TrackedEmailInput) => Promise<unknown>;
type ReminderTicket = NonNullable<Awaited<ReturnType<typeof loadReminderTicket>>>;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 4000);
  return String(error).slice(0, 4000);
}

function holderEmail(ticket: Pick<ReminderTicket, "participantEmail" | "transferredAt" | "originalOrderAccessRevokedAt" | "eventOrder">) {
  const raw = ticket.transferredAt || ticket.originalOrderAccessRevokedAt
    ? ticket.participantEmail
    : ticket.participantEmail ?? ticket.eventOrder.buyerEmail;
  const parsed = raw ? emailSchema.safeParse(normalizeEventTicketHolderEmail(raw)) : null;
  return parsed?.success ? parsed.data : null;
}

function hasCurrentCredential(ticket: Pick<ReminderTicket, "qrToken" | "ticketCode" | "qrVersion" | "qrVersions">) {
  return ticket.qrVersions.length === 1 &&
    ticket.qrVersions[0].version === ticket.qrVersion &&
    ticket.qrVersions[0].qrTokenHash === hashEventTicketQrToken(ticket.qrToken) &&
    ticket.qrVersions[0].ticketCodeHash === hashEventTicketCode(ticket.ticketCode);
}

export function resolveEligibleReminderTicket(ticket: ReminderTicket) {
  if (ticket.status !== "VALID" || ticket.eventOrder.status !== "PAID" || !hasCurrentCredential(ticket)) return null;
  const recipient = holderEmail(ticket);
  return recipient ? { recipient, ticket } : null;
}

async function loadReminderTicket(ticketId: string) {
  return prisma.eventTicket.findUnique({
    where: { id: ticketId },
    include: {
      event: true,
      eventOrder: { select: { status: true, buyerEmail: true, source: true } },
      qrVersions: { where: { status: "ACTIVE" } },
    },
  });
}

export function buildEventTicketReminderEmail(input: {
  holderName: string;
  eventName: string;
  eventStartAt: Date;
  venueName: string;
  ticketCode: string;
  qrToken: string;
}) {
  const ticketUrl = buildAbsoluteUrl(`/checkin/${encodeURIComponent(input.qrToken)}`);
  const eventDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(input.eventStartAt);
  const subject = `Seu ingresso para ${input.eventName} 🎟️`;
  const greeting = input.holderName.trim().split(/\s+/)[0] || input.holderName;
  const text = [
    `Olá, ${greeting}.`,
    "",
    `Este é um lembrete do seu ingresso para ${input.eventName}.`,
    `Data: ${eventDate}`,
    `Local: ${input.venueName}`,
    `Código: ${input.ticketCode}`,
    `Abrir ingresso: ${ticketUrl}`,
    "",
    "Esta é a credencial válida no momento do envio. Não compartilhe com terceiros.",
    "AAAU Uniritter",
  ].join("\n");
  const html = buildAaauTransactionalEmailHtml({
    title: "Seu ingresso está aqui",
    eyebrow: "Lembrete de ingresso",
    headerLabel: "Ingresso oficial",
    previewText: subject,
    paragraphs: [`Olá, ${greeting}.`, `Este é um lembrete do seu ingresso para ${input.eventName}.`],
    detailLines: [`Data: ${eventDate}`, `Local: ${input.venueName}`, `Código: ${input.ticketCode}`],
    action: { label: "Abrir meu ingresso", url: ticketUrl },
    footerNote: "Esta é a credencial válida no momento do envio. Não compartilhe com terceiros.",
  });
  return { subject, text, html, ticketUrl };
}

async function eligibleTicketsForEvent(eventId: string) {
  const tickets = await prisma.eventTicket.findMany({
    where: { eventId, status: "VALID", eventOrder: { status: "PAID" } },
    include: {
      event: true,
      eventOrder: { select: { status: true, buyerEmail: true, source: true } },
      qrVersions: { where: { status: "ACTIVE" } },
    },
  });
  return tickets.filter((ticket) => resolveEligibleReminderTicket(ticket));
}

export async function createEventTicketReminderCampaign(input: {
  eventId: string;
  scheduledFor: Date;
  idempotencyKey: string;
  actor: { role: "super_admin" | "event_staff"; adminUserId?: string | null };
  now?: Date;
}) {
  if (input.actor.role !== "super_admin") throw new Error("Apenas super_admin pode executar esta acao.");
  const now = input.now ?? new Date();
  if (!Number.isFinite(input.scheduledFor.getTime()) || input.scheduledFor < new Date(now.getTime() - 1_000)) {
    throw new Error("Escolha um horario presente ou futuro para a campanha.");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 160) throw new Error("Chave de idempotencia invalida.");
  const event = await prisma.ticketEvent.findUnique({ where: { id: input.eventId }, select: { id: true } });
  if (!event) throw new Error("Evento nao encontrado.");
  const estimatedEligible = (await eligibleTicketsForEvent(input.eventId)).length;
  try {
    const campaign = await prisma.eventTicketReminderCampaign.create({
      data: {
        eventId: input.eventId,
        scheduledFor: input.scheduledFor,
        idempotencyKey: input.idempotencyKey.trim(),
        eligibleCount: estimatedEligible,
        createdByAdminUserId: input.actor.adminUserId ?? null,
      },
    });
    await prisma.eventAdminAuditLog.create({
      data: {
        eventId: input.eventId,
        adminUserId: input.actor.adminUserId ?? null,
        action: "EVENT_TICKET_REMINDER_CAMPAIGN_CREATED",
        targetType: "EventTicketReminderCampaign",
        targetId: campaign.id,
        metadata: { scheduledFor: input.scheduledFor.toISOString(), estimatedEligible },
      },
    });
    return { campaign, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const campaign = await prisma.eventTicketReminderCampaign.findFirstOrThrow({
        where: {
          OR: [
            { idempotencyKey: input.idempotencyKey.trim() },
            { eventId: input.eventId, campaignType: "EVENT_TICKET_REMINDER", scheduledFor: input.scheduledFor },
          ],
        },
      });
      return { campaign, created: false };
    }
    throw error;
  }
}

async function expandCampaign(campaignId: string, now: Date) {
  const campaign = await prisma.eventTicketReminderCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.processingStartedAt) return;
  const eligible = await eligibleTicketsForEvent(campaign.eventId);
  await prisma.$transaction([
    prisma.eventTicketReminderDelivery.createMany({
      data: eligible.map((ticket) => ({ campaignId, ticketId: ticket.id, nextAttemptAt: now })),
      skipDuplicates: true,
    }),
    prisma.eventTicketReminderCampaign.update({
      where: { id: campaignId },
      data: { status: "PROCESSING", processingStartedAt: now, eligibleCount: eligible.length },
    }),
  ]);
}

async function refreshCampaign(campaignId: string, now: Date) {
  const grouped = await prisma.eventTicketReminderDelivery.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((row) => [row.status, row._count._all]));
  const sent = counts.get(EventTicketReminderDeliveryStatus.SENT) ?? 0;
  const failed = counts.get(EventTicketReminderDeliveryStatus.FAILED) ?? 0;
  const skipped = counts.get(EventTicketReminderDeliveryStatus.SKIPPED) ?? 0;
  const pending = (counts.get(EventTicketReminderDeliveryStatus.PENDING) ?? 0) +
    (counts.get(EventTicketReminderDeliveryStatus.PROCESSING) ?? 0);
  const status = pending > 0
    ? EventTicketReminderCampaignStatus.PROCESSING
    : failed > 0
      ? EventTicketReminderCampaignStatus.COMPLETED_WITH_FAILURES
      : EventTicketReminderCampaignStatus.COMPLETED;
  await prisma.eventTicketReminderCampaign.update({
    where: { id: campaignId },
    data: {
      status,
      eligibleCount: sent + failed,
      sentCount: sent,
      failedCount: failed,
      skippedCount: skipped,
      completedAt: status === EventTicketReminderCampaignStatus.PROCESSING ? null : now,
    },
  });
  return { status, sent, failed, skipped, pending };
}

export async function processEventTicketReminderCampaign(input: {
  campaignId: string;
  limit?: number;
  now?: Date;
  sender?: ReminderSender;
}) {
  if (input.sender && process.env.NODE_ENV !== "test") throw new Error("EVENT_TICKET_REMINDER_TEST_HOOK_FORBIDDEN");
  const now = input.now ?? new Date();
  const campaign = await prisma.eventTicketReminderCampaign.findUniqueOrThrow({ where: { id: input.campaignId } });
  if (campaign.status === "CANCELED" || campaign.scheduledFor > now) return { processed: 0, sent: 0, failed: 0, skipped: 0 };
  await expandCampaign(campaign.id, now);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const candidates = await prisma.eventTicketReminderDelivery.findMany({
    where: {
      campaignId: campaign.id,
      attemptCount: { lt: EVENT_TICKET_REMINDER_MAX_ATTEMPTS },
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "PROCESSING", processingStartedAt: { lt: new Date(now.getTime() - PROCESSING_LEASE_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const sender = input.sender ?? sendTrackedEmail;
  for (const candidate of candidates) {
    const claimed = await prisma.eventTicketReminderDelivery.updateMany({
      where: { id: candidate.id, status: candidate.status, attemptCount: candidate.attemptCount },
      data: { status: "PROCESSING", processingStartedAt: now, attemptCount: { increment: 1 }, lastError: null },
    });
    if (claimed.count !== 1) continue;
    const current = await loadReminderTicket(candidate.ticketId);
    const eligible = current ? resolveEligibleReminderTicket(current) : null;
    if (!eligible) {
      await prisma.eventTicketReminderDelivery.update({
        where: { id: candidate.id },
        data: { status: "SKIPPED", processingStartedAt: null, lastError: "TICKET_NOT_ELIGIBLE_AT_SEND_TIME" },
      });
      skipped += 1;
      continue;
    }
    const message = buildEventTicketReminderEmail({
      holderName: eligible.ticket.participantName,
      eventName: eligible.ticket.event.name,
      eventStartAt: eligible.ticket.event.startAt,
      venueName: eligible.ticket.event.venueName,
      ticketCode: eligible.ticket.ticketCode,
      qrToken: eligible.ticket.qrToken,
    });
    try {
      const result = await sender({
        kind: EmailDeliveryKind.EVENT_TICKET_REMINDER,
        idempotencyKey: `event-ticket-reminder/${campaign.id}/${eligible.ticket.id}`,
        eventOrderId: eligible.ticket.eventOrderId,
        to: eligible.recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (result && typeof result === "object" && "sent" in result && !(result as { sent: boolean }).sent &&
        (!((result as { reason?: string }).reason === "already_sent"))) {
        throw new Error(`EMAIL_NOT_ACCEPTED:${(result as { reason?: string }).reason ?? "unknown"}`);
      }
      await prisma.eventTicketReminderDelivery.update({
        where: { id: candidate.id },
        data: { status: "SENT", recipient: eligible.recipient, sentAt: now, processingStartedAt: null, lastError: null },
      });
      sent += 1;
    } catch (error) {
      const attempts = candidate.attemptCount + 1;
      await prisma.eventTicketReminderDelivery.update({
        where: { id: candidate.id },
        data: {
          status: "FAILED",
          recipient: eligible.recipient,
          processingStartedAt: null,
          nextAttemptAt: new Date(now.getTime() + Math.min(60 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 7))),
          lastError: errorMessage(error),
        },
      });
      failed += 1;
    }
  }
  await refreshCampaign(campaign.id, now);
  return { processed: sent + failed + skipped, sent, failed, skipped };
}

export async function processDueEventTicketReminderCampaigns(options: {
  limit?: number;
  now?: Date;
  sender?: ReminderSender;
} = {}) {
  const now = options.now ?? new Date();
  const campaigns = await prisma.eventTicketReminderCampaign.findMany({
    where: {
      status: { in: ["SCHEDULED", "PROCESSING", "COMPLETED_WITH_FAILURES"] },
      scheduledFor: { lte: now },
      OR: [
        { status: "SCHEDULED" },
        { deliveries: { some: { status: { in: ["PENDING", "PROCESSING", "FAILED"] }, attemptCount: { lt: EVENT_TICKET_REMINDER_MAX_ATTEMPTS }, nextAttemptAt: { lte: now } } } },
      ],
    },
    orderBy: { scheduledFor: "asc" },
    take: 5,
  });
  const total = { campaigns: 0, processed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const campaign of campaigns) {
    const result = await processEventTicketReminderCampaign({ ...options, campaignId: campaign.id });
    total.campaigns += 1;
    total.processed += result.processed;
    total.sent += result.sent;
    total.failed += result.failed;
    total.skipped += result.skipped;
  }
  return total;
}

export async function retryEventTicketReminderCampaign(campaignId: string, actor: { role: string }, now = new Date()) {
  if (actor.role !== "super_admin") throw new Error("Apenas super_admin pode executar esta acao.");
  await prisma.eventTicketReminderDelivery.updateMany({
    where: { campaignId, status: "FAILED" },
    data: { nextAttemptAt: now, attemptCount: 0 },
  });
  return prisma.eventTicketReminderCampaign.update({ where: { id: campaignId }, data: { status: "PROCESSING", completedAt: null } });
}
