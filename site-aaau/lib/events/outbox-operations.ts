import crypto from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { TrackedEmailInput } from "@/lib/email/delivery";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import { validateEventTicketOperationalConfig } from "@/lib/events/operational-config";
import {
  EVENT_TICKET_PORTAL_OUTBOX_MAX_ATTEMPTS,
  processEventTicketPortalOutbox,
} from "@/lib/events/portal-outbox";
import { expireEventTicketTransfers } from "@/lib/events/transfer-flow";
import {
  EVENT_TICKET_OUTBOX_MAX_ATTEMPTS,
  processEventTicketTransferOutbox,
} from "@/lib/events/transfer-outbox";
import { processDueEventTicketReminderCampaigns } from "@/lib/events/ticket-reminder-campaign";

const LEASE_KEY_HASH = crypto.createHash("sha256").update("event-ticket-outbox-cron-v1").digest("hex");
const LEASE_DURATION_MS = 2 * 60_000;

type Sender = (input: TrackedEmailInput) => Promise<unknown>;

async function countDueReminders(now: Date) {
  try {
    return await prisma.eventTicketReminderCampaign.count({
      where: { status: { in: ["SCHEDULED", "PROCESSING", "COMPLETED_WITH_FAILURES"] }, scheduledFor: { lte: now } },
    });
  } catch (error) {
    // Keeps the cron safe during a rolling deploy before the additive migration lands.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return 0;
    throw error;
  }
}

async function acquireLease(now: Date) {
  await prisma.eventTicketPortalRateLimit.deleteMany({
    where: { keyHash: LEASE_KEY_HASH, expiresAt: { lte: now } },
  });
  try {
    return await prisma.eventTicketPortalRateLimit.create({
      data: {
        keyHash: LEASE_KEY_HASH,
        action: "event-ticket-outbox-lease",
        count: 1,
        windowStartedAt: now,
        expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }
}

export async function runEventTicketOutboxCycle(options: {
  limit?: number;
  now?: Date;
  transferSender?: Sender;
  portalSender?: Sender;
  reminderSender?: Sender;
  afterLeaseAcquired?: () => Promise<void>;
} = {}) {
  if ((options.transferSender || options.portalSender || options.reminderSender || options.afterLeaseAcquired) && process.env.NODE_ENV !== "test") {
    throw new Error("EVENT_TICKET_OUTBOX_TEST_HOOK_FORBIDDEN");
  }
  const config = validateEventTicketOperationalConfig();
  const now = options.now ?? new Date();
  const hasDueReminder = await countDueReminders(now);
  if (!config.transfersEnabled && !config.portalEnabled && hasDueReminder === 0) {
    logEventTicketOperation("outbox.cycle_skipped", { reason: "disabled" });
    return { status: "disabled" as const };
  }
  const lease = await acquireLease(now);
  if (!lease) {
    logEventTicketOperation("outbox.cycle_skipped", { reason: "busy" });
    return { status: "busy" as const };
  }

  try {
    await options.afterLeaseAcquired?.();
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const expired = config.transfersEnabled ? await expireEventTicketTransfers(now) : { count: 0 };
    const transfer = config.transfersEnabled
      ? await processEventTicketTransferOutbox({ limit, now, sender: options.transferSender })
      : { processed: 0, sent: 0, failed: 0, exhausted: 0 };
    const portal = config.portalEnabled
      ? await processEventTicketPortalOutbox({ limit, now, sender: options.portalSender })
      : { processed: 0, sent: 0, failed: 0, exhausted: 0 };
    const reminder = await processDueEventTicketReminderCampaigns({ limit, now, sender: options.reminderSender });
    const [transferPending, transferExhausted, portalPending, portalExhausted] = await Promise.all([
      prisma.eventTicketTransferOutbox.count({ where: { encryptedPayload: { not: null }, attemptCount: { lt: EVENT_TICKET_OUTBOX_MAX_ATTEMPTS } } }),
      prisma.eventTicketTransferOutbox.count({ where: { encryptedPayload: { not: null }, attemptCount: { gte: EVENT_TICKET_OUTBOX_MAX_ATTEMPTS } } }),
      prisma.eventTicketPortalOutbox.count({ where: { encryptedPayload: { not: null }, attemptCount: { lt: EVENT_TICKET_PORTAL_OUTBOX_MAX_ATTEMPTS } } }),
      prisma.eventTicketPortalOutbox.count({ where: { encryptedPayload: { not: null }, attemptCount: { gte: EVENT_TICKET_PORTAL_OUTBOX_MAX_ATTEMPTS } } }),
    ]);
    const result = {
      status: "processed" as const,
      expired: expired.count,
      transfer,
      portal,
      reminder,
      pending: transferPending + portalPending,
      exhausted: transferExhausted + portalExhausted,
    };
    logEventTicketOperation("outbox.cycle_completed", {
      processed: transfer.processed + portal.processed + reminder.processed,
      sent: transfer.sent + portal.sent + reminder.sent,
      failed: transfer.failed + portal.failed + reminder.failed,
      exhausted: result.exhausted,
      pending: result.pending,
      expired: result.expired,
    });
    return result;
  } finally {
    await prisma.eventTicketPortalRateLimit.deleteMany({ where: { id: lease.id } });
  }
}
