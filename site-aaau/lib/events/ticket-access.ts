import type { EventOrderStatus, EventTicketStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { hashEventTicketAccessToken } from "@/lib/events/transfer-security";
import { eventTicketTransfersEnabled } from "@/lib/events/transfer-config";

type AvailableTicketView = {
  accessStatus: "AVAILABLE";
  id: string;
  ticketId: string;
  participantName: string;
  ticketCode: string;
  qrToken: string;
  status: EventTicketStatus;
  checkedInAt: Date | null;
  lot: { name: string };
};

type TransferredTicketView = {
  accessStatus: "TRANSFERRED";
  id: string;
  ticketId: string;
  transferredAt: Date;
  participantName?: undefined;
  ticketCode?: undefined;
  qrToken?: undefined;
  status?: undefined;
  checkedInAt?: undefined;
  lot?: undefined;
};

export type EventTicketAccessView = {
  accessKind: "ORIGINAL_ORDER" | "INDIVIDUAL_GRANT";
  status: EventOrderStatus;
  totalParticipantCount: number;
  event: { id: string; name: string; startAt: Date; venueName: string; venueAddress: string | null };
  tickets: Array<AvailableTicketView | TransferredTicketView>;
};

const eventSelect = {
  id: true, name: true, startAt: true, venueName: true, venueAddress: true,
} as const;

export async function getEventTicketsByAccessToken(accessToken: string): Promise<EventTicketAccessView | null> {
  const order = await prisma.eventOrder.findUnique({
    where: { accessToken },
    select: { id: true, status: true, event: { select: eventSelect }, _count: { select: { participants: true } } },
  });
  if (order) {
    const ticketIndex = order.status === "PAID" ? await prisma.eventTicket.findMany({
      where: { eventOrderId: order.id },
      select: {
        id: true, originalOrderAccessRevokedAt: true, transferredAt: true,
        issuedAt: true, createdAt: true,
      },
      orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }) : [];
    const availableIds = ticketIndex
      .filter((ticket) => !ticket.originalOrderAccessRevokedAt)
      .map((ticket) => ticket.id);
    const availableTickets = availableIds.length ? await prisma.eventTicket.findMany({
      where: { id: { in: availableIds }, originalOrderAccessRevokedAt: null },
      select: {
        id: true, participantName: true, ticketCode: true, qrToken: true, status: true,
        checkedInAt: true, lot: { select: { name: true } },
      },
    }) : [];
    const availableById = new Map(availableTickets.map((ticket) => [ticket.id, ticket]));
    return {
      accessKind: "ORIGINAL_ORDER",
      status: order.status,
      totalParticipantCount: order._count.participants,
      event: order.event,
      tickets: ticketIndex.map((ticket) => {
        if (ticket.originalOrderAccessRevokedAt) {
          return {
            accessStatus: "TRANSFERRED" as const,
            id: ticket.id,
            ticketId: ticket.id,
            transferredAt: ticket.transferredAt ?? ticket.originalOrderAccessRevokedAt,
          };
        }
        const available = availableById.get(ticket.id);
        if (!available) throw new Error("EVENT_TICKET_ACCESS_PROJECTION_CONFLICT");
        return {
          accessStatus: "AVAILABLE" as const,
          id: available.id,
          ticketId: available.id,
          participantName: available.participantName,
          ticketCode: available.ticketCode,
          qrToken: available.qrToken,
          status: available.status,
          checkedInAt: available.checkedInAt,
          lot: available.lot,
        };
      }),
    };
  }

  if (!eventTicketTransfersEnabled()) return null;

  const now = new Date();
  const grant = await prisma.eventTicketAccessGrant.findUnique({
    where: { tokenHash: hashEventTicketAccessToken(accessToken) },
    select: {
      ownershipVersion: true, revokedAt: true, expiresAt: true,
      ticket: { select: {
        id: true, ownershipVersion: true, participantName: true, ticketCode: true, qrToken: true,
        status: true, checkedInAt: true, lot: { select: { name: true } },
        eventOrder: { select: { status: true } }, event: { select: eventSelect },
      } },
    },
  });
  if (!grant || grant.revokedAt || (grant.expiresAt && grant.expiresAt <= now) || grant.ownershipVersion !== grant.ticket.ownershipVersion) {
    return null;
  }
  return {
    accessKind: "INDIVIDUAL_GRANT",
    status: grant.ticket.eventOrder.status,
    totalParticipantCount: 1,
    event: grant.ticket.event,
    tickets: [{
      accessStatus: "AVAILABLE",
      id: grant.ticket.id,
      ticketId: grant.ticket.id,
      participantName: grant.ticket.participantName,
      ticketCode: grant.ticket.ticketCode,
      qrToken: grant.ticket.qrToken,
      status: grant.ticket.status,
      checkedInAt: grant.ticket.checkedInAt,
      lot: grant.ticket.lot,
    }],
  };
}

export function eventOrderTicketsReady(order: EventTicketAccessView | null) {
  return Boolean(order && order.status === "PAID" && order.tickets.length === order.totalParticipantCount);
}
