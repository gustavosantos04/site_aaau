import { EventTicketTransferStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { eventTicketTransfersEnabled } from "@/lib/events/transfer-config";
import { maskEmail } from "@/lib/events/transfer-emails";

type PortalTicketState = "ACTIVE" | "USED" | "PENDING_TRANSFER" | "TRANSFERRED" | "CANCELED" | "REFUNDED";

type PortalVisibleTicket = {
  ticketId: string;
  state: Exclude<PortalTicketState, "TRANSFERRED">;
  participantName: string;
  lotName: string;
  qrToken?: string;
  ticketCode?: string;
  checkedInAt?: Date | null;
  canTransfer: boolean;
  pendingTransfer?: {
    stage: "CONFIRMAÇÃO DO TITULAR" | "ACEITE DO DESTINATÁRIO";
    recipientEmailMasked: string;
    expiresAt: Date;
  };
};

type PortalTransferredTicket = {
  ticketId: string;
  state: "TRANSFERRED";
  transferredAt: Date;
};

export type EventTicketPortalTicket = PortalVisibleTicket | PortalTransferredTicket;

export type EventTicketPortalGroup = {
  groupId: string;
  source: "ORIGINAL_ORDER" | "INDIVIDUAL_GRANT" | "TRANSFER_HISTORY";
  label: string;
  event: { name: string; startAt: Date; venueName: string; venueAddress: string | null };
  tickets: EventTicketPortalTicket[];
};

const eventSelect = { name: true, startAt: true, venueName: true, venueAddress: true } as const;
const pendingTransferSelect = {
  where: {
    status: { in: [
      EventTicketTransferStatus.PENDING_CURRENT_CONFIRMATION,
      EventTicketTransferStatus.PENDING_RECIPIENT_ACCEPTANCE,
    ] },
  },
  select: { status: true, toHolderEmail: true, expiresAt: true },
  orderBy: { createdAt: "desc" },
  take: 1,
} satisfies Prisma.EventTicket$transfersArgs;

function visibleTicket(ticket: {
  id: string;
  participantName: string;
  ticketCode: string;
  qrToken: string;
  status: "VALID" | "USED" | "CANCELED" | "REFUNDED";
  checkedInAt: Date | null;
  lot: { name: string };
  transfers: Array<{ status: string; toHolderEmail: string; expiresAt: Date }>;
}, now: Date): PortalVisibleTicket {
  const pending = ticket.transfers.find((transfer) => transfer.expiresAt > now);
  const state = pending ? "PENDING_TRANSFER" : ticket.status === "VALID" ? "ACTIVE" : ticket.status;
  const exposesCredential = state === "ACTIVE" || state === "PENDING_TRANSFER";
  return {
    ticketId: ticket.id,
    state,
    participantName: ticket.participantName,
    lotName: ticket.lot.name,
    qrToken: exposesCredential ? ticket.qrToken : undefined,
    ticketCode: exposesCredential ? ticket.ticketCode : undefined,
    checkedInAt: ticket.checkedInAt,
    canTransfer: eventTicketTransfersEnabled() && state === "ACTIVE",
    pendingTransfer: pending ? {
      stage: pending.status === "PENDING_CURRENT_CONFIRMATION" ? "CONFIRMAÇÃO DO TITULAR" : "ACEITE DO DESTINATÁRIO",
      recipientEmailMasked: maskEmail(pending.toHolderEmail),
      expiresAt: pending.expiresAt,
    } : undefined,
  };
}

export async function getEventTicketPortalView(session: { email: string; emailHash: string }, now = new Date()) {
  const [orders, grants, histories] = await Promise.all([
    prisma.eventOrder.findMany({
      where: {
        buyerEmail: { equals: session.email, mode: "insensitive" },
        status: { in: ["PAID", "CANCELED", "REFUNDED"] },
        tickets: { some: {} },
      },
      select: {
        id: true,
        event: { select: eventSelect },
        tickets: {
          select: {
            id: true, originalOrderAccessRevokedAt: true, transferredAt: true,
            issuedAt: true, createdAt: true,
          },
          orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.eventTicketAccessGrant.findMany({
      where: {
        holderEmailHash: session.emailHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true, ownershipVersion: true,
        ticket: { select: {
          id: true, ownershipVersion: true, participantName: true, ticketCode: true, qrToken: true,
          status: true, checkedInAt: true, lot: { select: { name: true } },
          event: { select: eventSelect }, transfers: pendingTransferSelect,
        } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.eventTicketTransfer.findMany({
      where: { fromHolderEmailHash: session.emailHash, status: "COMPLETED" },
      select: {
        id: true, ticketId: true, completedAt: true,
        ticket: { select: { event: { select: eventSelect } } },
      },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const availableOriginalIds = orders.flatMap((order) => order.tickets
    .filter((ticket) => !ticket.originalOrderAccessRevokedAt)
    .map((ticket) => ticket.id));
  const availableOriginalTickets = availableOriginalIds.length ? await prisma.eventTicket.findMany({
    where: { id: { in: availableOriginalIds }, originalOrderAccessRevokedAt: null },
    select: {
      id: true, participantName: true, ticketCode: true, qrToken: true, status: true,
      checkedInAt: true, lot: { select: { name: true } }, transfers: pendingTransferSelect,
    },
  }) : [];
  const originalById = new Map(availableOriginalTickets.map((ticket) => [ticket.id, ticket]));

  const groups: EventTicketPortalGroup[] = [];
  const representedTickets = new Set<string>();
  const currentGrantByTicketId = new Map(grants
    .filter((grant) => grant.ownershipVersion === grant.ticket.ownershipVersion)
    .map((grant) => [grant.ticket.id, grant]));
  for (const order of orders) {
    const tickets = order.tickets.map((ticket) => {
      representedTickets.add(ticket.id);
      if (ticket.originalOrderAccessRevokedAt) {
        const returnedGrant = currentGrantByTicketId.get(ticket.id);
        if (returnedGrant) return visibleTicket(returnedGrant.ticket, now);
        return {
          ticketId: ticket.id,
          state: "TRANSFERRED" as const,
          transferredAt: ticket.transferredAt ?? ticket.originalOrderAccessRevokedAt,
        };
      }
      const available = originalById.get(ticket.id);
      if (!available) throw new Error("EVENT_TICKET_PORTAL_PROJECTION_CONFLICT");
      return visibleTicket(available, now);
    });
    groups.push({ groupId: `order:${order.id}`, source: "ORIGINAL_ORDER", label: `Pedido com ${tickets.length} ingresso${tickets.length === 1 ? "" : "s"}`, event: order.event, tickets });
  }
  for (const grant of grants) {
    if (grant.ownershipVersion !== grant.ticket.ownershipVersion || representedTickets.has(grant.ticket.id)) continue;
    representedTickets.add(grant.ticket.id);
    groups.push({
      groupId: `grant:${grant.id}`,
      source: "INDIVIDUAL_GRANT",
      label: "Ingresso recebido por transferência",
      event: grant.ticket.event,
      tickets: [visibleTicket(grant.ticket, now)],
    });
  }
  for (const history of histories) {
    if (!history.completedAt || representedTickets.has(history.ticketId)) continue;
    representedTickets.add(history.ticketId);
    groups.push({
      groupId: `history:${history.id}`,
      source: "TRANSFER_HISTORY",
      label: "Histórico de transferência",
      event: history.ticket.event,
      tickets: [{ ticketId: history.ticketId, state: "TRANSFERRED", transferredAt: history.completedAt }],
    });
  }
  return { groups };
}
