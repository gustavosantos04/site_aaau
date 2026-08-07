import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";
import { hashPortalRateLimitKey } from "@/lib/events/portal-security";

export type PortalRateLimitBackend = {
  consume(input: { action: string; key: string; limit: number; windowMs: number; now: Date }): Promise<boolean>;
};

export const prismaPortalRateLimitBackend: PortalRateLimitBackend = {
  async consume(input) {
    const keyHash = hashPortalRateLimitKey(`${input.action}:${input.key}`);
    return runSerializableTransactionWithRetry(async (tx) => {
      await tx.eventTicketPortalRateLimit.deleteMany({ where: { keyHash, expiresAt: { lte: input.now } } });
      const bucket = await tx.eventTicketPortalRateLimit.upsert({
        where: { keyHash },
        create: {
          id: crypto.randomUUID(), keyHash, action: input.action, count: 1,
          windowStartedAt: input.now, expiresAt: new Date(input.now.getTime() + input.windowMs),
        },
        update: { count: { increment: 1 } },
      });
      return bucket.count <= input.limit;
    });
  },
};

export async function consumePortalRateLimits(input: {
  action: string;
  ip: string;
  emailHash?: string;
  tokenFingerprint?: string;
  limit?: number;
  windowMs?: number;
  now?: Date;
  backend?: PortalRateLimitBackend;
}) {
  const now = input.now ?? new Date();
  const backend = input.backend ?? prismaPortalRateLimitBackend;
  const keys = [`ip:${input.ip || "unknown"}`];
  if (input.emailHash) keys.push(`email:${input.emailHash}`);
  if (input.tokenFingerprint) keys.push(`token:${input.tokenFingerprint}`);
  const results = await Promise.all(keys.map((key) => backend.consume({
    action: input.action,
    key,
    limit: input.limit ?? 8,
    windowMs: input.windowMs ?? 15 * 60_000,
    now,
  })));
  return results.every(Boolean);
}
