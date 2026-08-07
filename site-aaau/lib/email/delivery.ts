import { EmailDeliveryKind, EmailDeliveryStatus } from "@prisma/client";
import { Resend } from "resend";

import { prisma } from "@/lib/db/prisma";
import { createSmtpTransport, getSmtpConfig } from "@/lib/email/smtp";
import { logEventTicketOperation } from "@/lib/events/operations-log";

const EMAIL_SENDING_LEASE_MS = 5 * 60_000;
export const EMAIL_PROVIDER_TIMEOUT_MS = 8_000;
const DEFAULT_FROM = "AAAU UniRitter <ingressos@aaau.com.br>";

export type TrackedEmailInput = {
  kind: EmailDeliveryKind;
  idempotencyKey: string;
  orderId?: string;
  eventOrderId?: string;
  transferId?: string;
  portalSessionId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
  replyTo?: string;
};

type DeliveryTestHooks = {
  timeoutMs?: number;
  resendSend?: (input: TrackedEmailInput) => Promise<string>;
  smtpSend?: (input: TrackedEmailInput) => Promise<string | null>;
};

export class EmailProviderTimeoutError extends Error {
  constructor() {
    super("EMAIL_PROVIDER_TIMEOUT");
    this.name = "EmailProviderTimeoutError";
  }
}

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
  const smtp = getSmtpConfig();

  if (resendApiKey) {
    return {
      provider: "RESEND" as const,
      resendApiKey,
      smtpFallback: smtp,
      from: resendFrom,
      replyTo,
      internalRecipient,
    };
  }

  if (!smtp) return null;
  return {
    provider: "SMTP" as const,
    smtp,
    from: smtp.from,
    replyTo,
    internalRecipient: smtp.internalRecipient,
  };
}

async function withProviderTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new EmailProviderTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export async function sendTrackedEmail(
  input: TrackedEmailInput,
  options: { testHooks?: DeliveryTestHooks } = {},
) {
  if (options.testHooks && process.env.NODE_ENV !== "test") {
    throw new Error("EMAIL_DELIVERY_TEST_HOOKS_FORBIDDEN");
  }
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
      transferId: input.transferId,
      portalSessionId: input.portalSessionId,
      sender: from,
      recipient: input.to,
      subject: input.subject,
      status: EmailDeliveryStatus.SENDING,
      attemptCount: 1,
      lastAttemptAt: now,
    },
    update: {
      provider: config.provider,
      transferId: input.transferId,
      portalSessionId: input.portalSessionId,
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
    let deliveredProvider = config.provider;
    let deliveredFrom = from;
    const timeoutMs = options.testHooks?.timeoutMs ?? EMAIL_PROVIDER_TIMEOUT_MS;

    if (config.provider === "RESEND") {
      const controller = new AbortController();
      try {
        providerEmailId = await withProviderTimeout(async () => {
          if (options.testHooks?.resendSend) return options.testHooks.resendSend(input);
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
            { idempotencyKey: input.idempotencyKey, signal: controller.signal } as never,
          );
          if (error) throw new Error(error.message);
          if (!data?.id) throw new Error("O Resend aceitou a requisição sem retornar o identificador do e-mail.");
          return data.id;
        }, timeoutMs, () => controller.abort());
      } catch (resendError) {
        // A timeout is ambiguous: the provider may have accepted the message before
        // the connection was interrupted. Retrying with SMTP here could duplicate it.
        if (resendError instanceof EmailProviderTimeoutError || !config.smtpFallback) throw resendError;
        deliveredProvider = "SMTP";
        deliveredFrom = input.from ?? config.smtpFallback.from;
        if (options.testHooks?.smtpSend) {
          providerEmailId = await withProviderTimeout(() => options.testHooks!.smtpSend!(input), timeoutMs);
        } else {
          const transport = createSmtpTransport(config.smtpFallback, timeoutMs);
          try {
            const info = await withProviderTimeout(() => transport.sendMail({
              from: deliveredFrom,
              to: input.to,
              subject: input.subject,
              text: input.text,
              html: input.html,
              replyTo,
            }), timeoutMs, () => transport.close());
            providerEmailId = info.messageId || null;
          } finally {
            transport.close();
          }
        }
      }
    } else if (options.testHooks?.smtpSend) {
      providerEmailId = await withProviderTimeout(() => options.testHooks!.smtpSend!(input), timeoutMs);
    } else {
      const transport = createSmtpTransport(config.smtp, timeoutMs);
      try {
        const info = await withProviderTimeout(() => transport.sendMail({
          from,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          replyTo,
        }), timeoutMs, () => transport.close());
        providerEmailId = info.messageId || null;
      } finally {
        transport.close();
      }
    }

    await prisma.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        provider: deliveredProvider,
        sender: deliveredFrom,
        providerEmailId,
        status: EmailDeliveryStatus.SENT,
        sentAt: now,
        failedAt: null,
        lastError: null,
      },
    });
    if (input.transferId || input.portalSessionId) {
      logEventTicketOperation("email.sent", {
        deliveryId: delivery.id,
        transferId: input.transferId,
        portalSessionId: input.portalSessionId,
      });
    }

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
    if (input.transferId || input.portalSessionId) {
      logEventTicketOperation("email.failed", {
        deliveryId: delivery.id,
        transferId: input.transferId,
        portalSessionId: input.portalSessionId,
      });
    }
    throw error;
  }
}
