import { EventTicketTransferStatus } from "@prisma/client";

import type { EventTx } from "@/lib/events/types";

type TransferHistoryReader = Pick<EventTx, "eventTicketTransfer">;

export const EVENT_TICKET_TRANSFER_LIMIT_REACHED = "EVENT_TICKET_TRANSFER_LIMIT_REACHED";

export async function assertEventTicketTransferLimitAvailable(
  tx: TransferHistoryReader,
  ticketId: string,
  excludeTransferId?: string,
) {
  const completedTransfer = await tx.eventTicketTransfer.findFirst({
    where: {
      ticketId,
      status: EventTicketTransferStatus.COMPLETED,
      ...(excludeTransferId ? { id: { not: excludeTransferId } } : {}),
    },
    select: { id: true },
  });
  if (completedTransfer) throw new Error(EVENT_TICKET_TRANSFER_LIMIT_REACHED);
}
