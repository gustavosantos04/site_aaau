import { prisma } from "@/lib/db/prisma";
import { TicketAlreadyUsedError, TicketNotFoundError } from "@/lib/events/errors";
import { runSerializableTransactionWithRetry } from "@/lib/events/transaction";
import type { CheckInSource, CheckInValidationStatus, EventTx } from "@/lib/events/types";

function statusFromTicket(ticket: {
  eventId: string;
  status: string;
  checkedInAt: Date | null;
  eventOrder: { status: string };
}, eventId: string): CheckInValidationStatus {
  if (ticket.eventId !== eventId) return "WRONG_EVENT";
  if (ticket.eventOrder.status !== "PAID") return "INVALID";
  if (ticket.status === "USED" || ticket.checkedInAt) return "ALREADY_USED";
  if (ticket.status === "CANCELED") return "CANCELED";
  if (ticket.status === "REFUNDED") return "REFUNDED";
  if (ticket.status !== "VALID") return "INVALID";
  return "VALID";
}

async function findTicketForCheckIn(tx: EventTx | typeof prisma, qrToken: string) {
  return tx.eventTicket.findUnique({
    where: { qrToken },
    include: {
      lot: true,
      eventOrder: true,
    },
  });
}

export async function validateEventTicketForCheckIn(eventId: string, qrToken: string) {
  const ticket = await findTicketForCheckIn(prisma, qrToken);

  if (!ticket) {
    return { status: "INVALID" as const, ticket: null };
  }

  return {
    status: statusFromTicket(ticket, eventId),
    ticket,
  };
}

export async function confirmEventTicketCheckIn(input: {
  eventId: string;
  qrToken: string;
  adminUserId: string;
  source: CheckInSource;
  deviceInfo?: string | null;
}) {
  const result = await runSerializableTransactionWithRetry(async (tx) => {
    const ticket = await findTicketForCheckIn(tx, input.qrToken);

    if (!ticket) {
      await tx.eventCheckInLog.create({
        data: {
          eventId: input.eventId,
          adminUserId: input.adminUserId,
          action: input.source === "QR" ? "QR_CONFIRM" : "MANUAL_CONFIRM",
          result: "INVALID",
          deviceInfo: input.deviceInfo ?? null,
        },
      });
      return { status: "INVALID" as const, ticketId: null };
    }

    const changed = await tx.eventTicket.updateMany({
      where: {
        id: ticket.id,
        eventId: input.eventId,
        status: "VALID",
        checkedInAt: null,
        eventOrder: { status: "PAID" },
      },
      data: {
        status: "USED",
        checkedInAt: new Date(),
        checkedInByUserId: input.adminUserId,
      },
    });

    if (changed.count === 1) {
      await tx.eventCheckInLog.create({
        data: {
          ticketId: ticket.id,
          eventId: input.eventId,
          adminUserId: input.adminUserId,
          action: input.source === "QR" ? "QR_CONFIRM" : "MANUAL_CONFIRM",
          result: "CHECKED_IN",
          deviceInfo: input.deviceInfo ?? null,
        },
      });

      return { status: "CHECKED_IN" as const, ticketId: ticket.id };
    }

    const current = await findTicketForCheckIn(tx, input.qrToken);
      const result = current ? statusFromTicket(current, input.eventId) : "INVALID";

    await tx.eventCheckInLog.create({
      data: {
        ticketId: current?.id ?? null,
        eventId: input.eventId,
        adminUserId: input.adminUserId,
        action: input.source === "QR" ? "QR_CONFIRM" : "MANUAL_CONFIRM",
        result:
          result === "ALREADY_USED"
            ? "ALREADY_USED"
            : result === "WRONG_EVENT"
              ? "WRONG_EVENT"
              : "INVALID",
        deviceInfo: input.deviceInfo ?? null,
      },
    });

    return { status: result, ticketId: current?.id ?? null };
  });

  if (result.status === "CHECKED_IN") {
    return result;
  }

  if (result.status === "ALREADY_USED") {
    throw new TicketAlreadyUsedError();
  }

  throw new TicketNotFoundError();
}
