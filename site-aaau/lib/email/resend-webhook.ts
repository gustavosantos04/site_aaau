import { EmailDeliveryStatus, Prisma } from "@prisma/client";
import type { WebhookEventPayload } from "resend";

import { prisma } from "@/lib/db/prisma";

const statusByEventType: Partial<Record<WebhookEventPayload["type"], EmailDeliveryStatus>> = {
  "email.sent": EmailDeliveryStatus.SENT,
  "email.delivered": EmailDeliveryStatus.DELIVERED,
  "email.delivery_delayed": EmailDeliveryStatus.DELAYED,
  "email.bounced": EmailDeliveryStatus.BOUNCED,
  "email.failed": EmailDeliveryStatus.FAILED,
  "email.complained": EmailDeliveryStatus.COMPLAINED,
  "email.suppressed": EmailDeliveryStatus.SUPPRESSED,
};

export function resendDeliveryStatus(type: string) {
  return statusByEventType[type as WebhookEventPayload["type"]] ?? null;
}

function eventError(payload: WebhookEventPayload) {
  if (payload.type === "email.failed") return payload.data.failed.reason;
  if (payload.type === "email.bounced") return payload.data.bounce.message;
  if (payload.type === "email.suppressed") return payload.data.suppressed.message;
  return null;
}

export async function recordResendWebhookEvent(providerEventId: string, payload: WebhookEventPayload) {
  if (!("email_id" in payload.data)) return { ignored: true, duplicate: false };

  const providerEmailId = payload.data.email_id;
  const occurredAt = new Date(payload.created_at);
  const taggedDeliveryId = "tags" in payload.data ? payload.data.tags?.delivery_id : undefined;
  const delivery = await prisma.emailDelivery.findFirst({
    where: {
      OR: [
        { providerEmailId },
        ...(taggedDeliveryId ? [{ id: taggedDeliveryId }] : []),
      ],
    },
  });

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.emailDeliveryEvent.create({
        data: {
          providerEventId,
          providerEmailId,
          emailDeliveryId: delivery?.id,
          type: payload.type,
          occurredAt,
          payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
        },
      });

      const status = resendDeliveryStatus(payload.type);
      if (!delivery || !status || (delivery.lastEventAt && occurredAt < delivery.lastEventAt)) return;

      await transaction.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          providerEmailId: delivery.providerEmailId ?? providerEmailId,
          status,
          lastEventAt: occurredAt,
          deliveredAt: status === EmailDeliveryStatus.DELIVERED ? occurredAt : undefined,
          failedAt: new Set<EmailDeliveryStatus>([
            EmailDeliveryStatus.BOUNCED,
            EmailDeliveryStatus.FAILED,
            EmailDeliveryStatus.SUPPRESSED,
          ]).has(status)
            ? occurredAt
            : undefined,
          complainedAt: status === EmailDeliveryStatus.COMPLAINED ? occurredAt : undefined,
          lastError: eventError(payload),
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ignored: false, duplicate: true };
    }
    throw error;
  }

  return { ignored: false, duplicate: false };
}
