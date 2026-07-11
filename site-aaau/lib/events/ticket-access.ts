import { prisma } from "@/lib/db/prisma";

export async function getEventTicketsByAccessToken(accessToken: string) {
  return prisma.eventOrder.findUnique({
    where: { accessToken },
    include: {
      event: true,
      participants: { select: { id: true } },
      tickets: {
        include: { lot: true },
        orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }, { ticketCode: "asc" }],
      },
    },
  });
}

export function eventOrderTicketsReady(order: Awaited<ReturnType<typeof getEventTicketsByAccessToken>>) {
  return Boolean(order && order.status === "PAID" && order.tickets.length === order.participants.length);
}
