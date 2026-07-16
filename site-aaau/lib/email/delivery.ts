import { EmailDeliveryKind, EmailDeliveryStatus } from "@prisma/client";
import { Resend } from "resend";

import { prisma } from "@/lib/db/prisma";
import { createSmtpTransport, getSmtpConfig } from "@/lib/email/smtp";

const EMAIL_SENDING_LEASE_MS = 5 * 60_000;
const DEFAULT_FROM = "AAAU UniRitter <ingressos@aaau.com.br>";

type TrackedEmailInput = {
  kind: EmailDeliveryKind;
  idempotencyKey: string;
  orderId?: string;
  eventOrderId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
  replyTo?: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 4000);
  if (typeof error === "string") return error.slice(0, 4000);
  try {
    return JSON.stringify(error).slice(0, 4000);
  } catch {
    return "Falha desconhecida no envio do e-mail.";
  }
}

export function getTransactionalEmailConfig() {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.RESEND_FROM?.trim() || DEFAULT_FROM;
  const replyTo = process.env.RESEND_REPLY_TO?.trim() || process.env.SMTP_USER?.trim();
  const internalRecipient = process.env.ORDER_NOTIFICATION_EMAIL?.trim();

  if (resendApiKey) {
    return {
      provider: "RESEND" as const,
      resendApiKey,
      from: resendFrom,
      replyTo,
      internalRecipient,
    };
  }

  const smtp = getSmtpConfig();
  if (!smtp) return null;
  return {
    provider: "SMTP" as const,
    smtp,
    from: smtp.from,
    replyTo,
    internalRecipient: smtp.internalRecipient,
  };
}

function isAlreadyAccepted(status: EmailDeliveryStatus) {
  const acceptedStatuses = new Set<EmailDeliveryStatus>([
    EmailDeliveryStatus.SENT,
    EmailDeliveryStatus.DELIVERED,
    EmailDeliveryStatus.DELAYED,
    EmailDeliveryStatus.BOUNCED,
    EmailDeliveryStatus.COMPLAINED,
    EmailDeliveryStatus.SUPPRESSED,
  ]);
  return acceptedStatuses.has(status);
}

export async function sendTrackedEmail(input: TrackedEmailInput) {
  const config = getTransactionalEmailConfig();
  if (!config) return { sent: false, skipped: true, reason: "not_configured" as const };

  const now = new Date();
  const from = input.from ?? config.from;
  const replyTo = input.replyTo ?? config.replyTo;
  const existing = await prisma.emailDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey } });

  if (existing && isAlreadyAccepted(existing.status)) {
    return {
      sent: false,
      skipped: true,
      reason: "already_sent" as const,
      deliveryId: existing.id,
      providerEmailId: existing.providerEmailId,
    };
  }

  if (
    existing?.status === EmailDeliveryStatus.SENDING &&
    existing.lastAttemptAt &&
    now.getTime() - existing.lastAttemptAt.getTime() < EMAIL_SENDING_LEASE_MS
  ) {
    return {
      sent: false,
      skipped: true,
      reason: "sending" as const,
      deliveryId: existing.id,
      providerEmailId: existing.providerEmailId,
    };
  }

  const delivery = await prisma.emailDelivery.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      provider: config.provider,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      orderId: input.orderId,
      eventOrderId: input.eventOrderId,
      sender: from,
      recipient: input.to,
      subject: input.subject,
      status: EmailDeliveryStatus.SENDING,
      attemptCount: 1,
      lastAttemptAt: now,
    },
    update: {
      provider: config.provider,
      sender: from,
      recipient: input.to,
      subject: input.subject,
      status: EmailDeliveryStatus.SENDING,
      attemptCount: { increment: 1 },
      lastAttemptAt: now,
      lastError: null,
    },
  });

  try {
    let providerEmailId: string | null = null;

    if (config.provider === "RESEND") {
      const resend = new Resend(config.resendApiKey);
      const { data, error } = await resend.emails.send(
        {
          from,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          replyTo,
          tags: [
            { name: "category", value: input.kind.toLowerCase() },
            { name: "delivery_id", value: delivery.id },
          ],
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error("O Resend aceitou a requisição sem retornar o identificador do e-mail.");
      providerEmailId = data.id;
    } else {
      const info = await createSmtpTransport(config.smtp).sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo,
      });
      providerEmailId = info.messageId || null;
    }

    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        providerEmailId,
        status: EmailDeliveryStatus.SENT,
        sentAt: now,
        failedAt: null,
        lastError: null,
      },
    });

    return {
      sent: true,
      skipped: false,
      reason: "sent" as const,
      deliveryId: delivery.id,
      providerEmailId,
    };
  } catch (error) {
    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: EmailDeliveryStatus.FAILED,
        failedAt: now,
        lastError: errorMessage(error),
      },
    });
    throw error;
  }
}
