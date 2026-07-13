import { EventTicketConfirmationEmailStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { createSmtpTransport, getSmtpConfig } from "@/lib/email/smtp";
import { buildAbsoluteUrl } from "@/lib/site-url";

export const EVENT_TICKET_EMAIL_SENDING_LEASE_MS = 5 * 60_000;

export class AmbiguousEventTicketEmailError extends Error {
  constructor() {
    super("Envio de email de ingressos ficou ambiguo.");
  }
}

type EventTicketEmailOrder = NonNullable<Awaited<ReturnType<typeof loadEventTicketEmailOrder>>>;

export type EventTicketEmailSender = {
  sendMail: (message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<unknown>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatEventDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

async function loadEventTicketEmailOrder(eventOrderId: string) {
  return prisma.eventOrder.findUnique({
    where: { id: eventOrderId },
    include: {
      event: true,
      participants: { select: { id: true } },
      tickets: { select: { id: true } },
    },
  });
}

function ticketsAreReady(order: Pick<EventTicketEmailOrder, "status" | "participants" | "tickets">) {
  return order.status === "PAID" && order.tickets.length > 0 && order.tickets.length === order.participants.length;
}

export async function claimEventTicketConfirmationEmail(eventOrderId: string, now = new Date()) {
  const changed = await prisma.eventOrder.updateMany({
    where: {
      id: eventOrderId,
      status: "PAID",
      ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.NOT_SENT,
      tickets: { some: {} },
    },
    data: {
      ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.SENDING,
      ticketConfirmationEmailStartedAt: now,
      ticketConfirmationEmailLastErrorAt: null,
    },
  });

  return changed.count === 1;
}

async function markAbandonedSendingAsAmbiguous(eventOrderId: string, now: Date) {
  await prisma.eventOrder.updateMany({
    where: {
      id: eventOrderId,
      ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.SENDING,
      ticketConfirmationEmailStartedAt: {
        lt: new Date(now.getTime() - EVENT_TICKET_EMAIL_SENDING_LEASE_MS),
      },
    },
    data: {
      ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.AMBIGUOUS,
      ticketConfirmationEmailLastErrorAt: now,
    },
  });
}

export function buildEventTicketConfirmationEmail(input: {
  order: Pick<EventTicketEmailOrder, "buyerName" | "accessToken">;
  event: Pick<EventTicketEmailOrder["event"], "name" | "startAt" | "venueName" | "venueAddress">;
  ticketCount: number;
  baseUrl?: string;
}) {
  const ticketsUrl = input.baseUrl
    ? `${input.baseUrl.replace(/\/+$/, "")}/meus-ingressos/${input.order.accessToken}`
    : buildAbsoluteUrl(`/meus-ingressos/${input.order.accessToken}`);
  const eventDate = formatEventDate(input.event.startAt);
  const venue = input.event.venueAddress || input.event.venueName;
  const subject = `Seus ingressos para ${input.event.name} estão confirmados`;
  const greeting = firstName(input.order.buyerName);
  const mascotUrl = `${new URL(ticketsUrl).origin}/images/mascots/bull_torcida.png`;

  const text = [
    `Olá, ${greeting}.`,
    "",
    `Seu pagamento foi confirmado e seus ingressos para ${input.event.name} já estão disponíveis.`,
    "",
    `Evento: ${input.event.name}`,
    `Data: ${eventDate}`,
    `Local: ${venue}`,
    `Quantidade de ingressos: ${input.ticketCount}`,
    "",
    `Ver meus ingressos: ${ticketsUrl}`,
    "",
    "Cada participante possui um QR Code individual.",
    "Apresente o ingresso correspondente na entrada do evento.",
    "Não compartilhe seu QR Code com terceiros.",
    "",
    "AAAU Uniritter",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#080607;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#080607;border-collapse:collapse;">
        <tr>
          <td align="center" style="padding:28px 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-collapse:collapse;background:#120d0f;border:1px solid rgba(255,255,255,.12);border-radius:18px;overflow:hidden;">
              <tr>
                <td style="padding:20px 28px;background:#7b1023;font-family:Arial,sans-serif;color:#ffffff;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                    <tr>
                      <td>
                        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;font-weight:800;">AAAU Uniritter</div>
                        <div style="margin-top:8px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#f3d2dc;">Ingressos confirmados</div>
                      </td>
                      <td align="right" width="112">
                        <img src="${mascotUrl}" width="96" alt="Bull da AAAU" style="display:block;width:96px;max-width:100%;height:auto;margin-left:auto;" />
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:30px 28px 10px;font-family:Arial,sans-serif;">
                  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#e3bd8f;font-weight:800;">Pagamento confirmado</div>
                  <h1 style="margin:10px 0 12px;font-size:30px;line-height:1.08;color:#ffffff;text-transform:uppercase;">Seus ingressos estão disponíveis.</h1>
                  <p style="margin:0;font-size:15px;line-height:1.65;color:#ddd0d5;">Olá, ${escapeHtml(greeting)}. Seu pagamento foi confirmado e seus ingressos para <strong style="color:#ffffff;">${escapeHtml(input.event.name)}</strong> já podem ser acessados.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 28px 0;font-family:Arial,sans-serif;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#1a1115;border:1px solid rgba(227,189,143,.35);border-radius:14px;">
                    <tr><td style="padding:16px;color:#f4ecef;font-size:14px;line-height:1.7;">
                      <strong>Evento:</strong> ${escapeHtml(input.event.name)}<br />
                      <strong>Data:</strong> ${escapeHtml(eventDate)}<br />
                      <strong>Local:</strong> ${escapeHtml(venue)}<br />
                      <strong>Quantidade:</strong> ${input.ticketCount} ingresso${input.ticketCount > 1 ? "s" : ""}
                    </td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 28px 8px;font-family:Arial,sans-serif;">
                  <a href="${ticketsUrl}" style="display:inline-block;background:#b0173f;color:#ffffff;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:13px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;">Ver meus ingressos</a>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 28px 30px;font-family:Arial,sans-serif;color:#c8b8bf;font-size:13px;line-height:1.7;">
                  Cada participante possui um QR Code individual. Apresente o ingresso correspondente na entrada do evento e não compartilhe seu QR Code com terceiros.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return { subject, text, html, ticketsUrl };
}

export async function ensureEventTicketConfirmationEmail(
  eventOrderId: string,
  options: {
    now?: Date;
    sender?: EventTicketEmailSender;
    from?: string;
    baseUrl?: string;
  } = {},
) {
  const now = options.now ?? new Date();
  let order = await loadEventTicketEmailOrder(eventOrderId);

  if (!order || !ticketsAreReady(order)) {
    return { sent: false, skipped: true, reason: "not_ready" as const };
  }

  if (order.ticketConfirmationEmailStatus === "SENT") {
    return { sent: false, skipped: true, reason: "already_sent" as const };
  }

  if (order.ticketConfirmationEmailStatus === "AMBIGUOUS") {
    return { sent: false, skipped: true, reason: "ambiguous" as const };
  }

  if (order.ticketConfirmationEmailStatus === "SENDING") {
    const startedAt = order.ticketConfirmationEmailStartedAt;
    if (startedAt && now.getTime() - startedAt.getTime() < EVENT_TICKET_EMAIL_SENDING_LEASE_MS) {
      return { sent: false, skipped: true, reason: "sending_recent" as const };
    }

    await markAbandonedSendingAsAmbiguous(order.id, now);
    return { sent: false, skipped: true, reason: "sending_ambiguous" as const };
  }

  const claimed = await claimEventTicketConfirmationEmail(order.id, now);
  if (!claimed) {
    return { sent: false, skipped: true, reason: "claim_lost" as const };
  }

  order = await loadEventTicketEmailOrder(eventOrderId);
  if (!order || !ticketsAreReady(order)) {
    await prisma.eventOrder.update({
      where: { id: eventOrderId },
      data: {
        ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.NOT_SENT,
        ticketConfirmationEmailStartedAt: null,
      },
    });
    return { sent: false, skipped: true, reason: "not_ready_after_claim" as const };
  }

  const config = getSmtpConfig();
  const sender = options.sender ?? (config ? createSmtpTransport(config) : null);
  const from = options.from ?? config?.from;

  if (!sender || !from) {
    await prisma.eventOrder.update({
      where: { id: eventOrderId },
      data: {
        ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.NOT_SENT,
        ticketConfirmationEmailStartedAt: null,
        ticketConfirmationEmailLastErrorAt: now,
      },
    });
    return { sent: false, skipped: true, reason: "smtp_not_configured" as const };
  }

  const message = buildEventTicketConfirmationEmail({
    order,
    event: order.event,
    ticketCount: order.tickets.length,
    baseUrl: options.baseUrl,
  });

  try {
    await sender.sendMail({
      from,
      to: order.buyerEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (error) {
    await prisma.eventOrder.update({
      where: { id: eventOrderId },
      data: {
        ticketConfirmationEmailStatus:
          error instanceof AmbiguousEventTicketEmailError
            ? EventTicketConfirmationEmailStatus.AMBIGUOUS
            : EventTicketConfirmationEmailStatus.NOT_SENT,
        ticketConfirmationEmailStartedAt:
          error instanceof AmbiguousEventTicketEmailError ? order.ticketConfirmationEmailStartedAt : null,
        ticketConfirmationEmailLastErrorAt: now,
      },
    });
    return {
      sent: false,
      skipped: false,
      reason: error instanceof AmbiguousEventTicketEmailError ? "smtp_ambiguous" as const : "smtp_failed" as const,
    };
  }

  await prisma.eventOrder.update({
    where: { id: eventOrderId },
    data: {
      ticketConfirmationEmailStatus: EventTicketConfirmationEmailStatus.SENT,
      ticketConfirmationEmailSentAt: now,
      ticketConfirmationEmailLastErrorAt: null,
    },
  });

  return { sent: true, skipped: false, reason: "sent" as const };
}

export function asEventTicketEmailJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
