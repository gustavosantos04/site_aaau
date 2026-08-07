import type { TrackedEmailInput } from "@/lib/email/delivery";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import { processEventTicketPortalOutboxItems } from "@/lib/events/portal-outbox";
import { processEventTicketTransferOutboxItems } from "@/lib/events/transfer-outbox";

type Sender = (input: TrackedEmailInput) => Promise<unknown>;

const EMPTY_RESULT = { processed: 0, sent: 0, failed: 0, exhausted: 0 } as const;

export async function deliverEventTicketOutboxImmediately(input: {
  transferOutboxIds?: string[];
  portalOutboxIds?: string[];
  now?: Date;
  transferSender?: Sender;
  portalSender?: Sender;
}) {
  if ((input.transferSender || input.portalSender) && process.env.NODE_ENV !== "test") {
    throw new Error("EVENT_TICKET_IMMEDIATE_OUTBOX_TEST_SENDER_FORBIDDEN");
  }

  const transferIds = [...new Set(input.transferOutboxIds ?? [])];
  const portalIds = [...new Set(input.portalOutboxIds ?? [])];
  const [transfer, portal] = await Promise.all([
    transferIds.length
      ? processEventTicketTransferOutboxItems({ ids: transferIds, now: input.now, sender: input.transferSender })
      : EMPTY_RESULT,
    portalIds.length
      ? processEventTicketPortalOutboxItems({ ids: portalIds, now: input.now, sender: input.portalSender })
      : EMPTY_RESULT,
  ]);

  logEventTicketOperation("outbox.immediate_completed", {
    processed: transfer.processed + portal.processed,
    sent: transfer.sent + portal.sent,
    failed: transfer.failed + portal.failed,
    exhausted: transfer.exhausted + portal.exhausted,
  });
  return { transfer, portal };
}
