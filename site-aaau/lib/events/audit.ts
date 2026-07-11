import type { Prisma } from "@prisma/client";

import type { EventTx } from "@/lib/events/types";

const SENSITIVE_KEYS = new Set([
  "cpf",
  "qrToken",
  "accessToken",
  "password",
  "mercadoPagoAccessToken",
]);

function redactMetadata(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object") {
    return value as Prisma.InputJsonValue;
  }

  if (Array.isArray(value)) {
    return value.map(redactMetadata) as Prisma.InputJsonValue;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_KEYS.has(key) ? "[redacted]" : redactMetadata(entry),
    ]),
  ) as Prisma.InputJsonValue;
}

export async function createEventAdminAuditLog(
  tx: EventTx,
  input: {
    eventId?: string | null;
    adminUserId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: unknown;
  },
) {
  await tx.eventAdminAuditLog.create({
    data: {
      eventId: input.eventId ?? null,
      adminUserId: input.adminUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      metadata: input.metadata === undefined ? undefined : redactMetadata(input.metadata),
    },
  });
}
