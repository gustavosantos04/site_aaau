import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";
import { formatMoney } from "@/lib/events/public";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accessToken: string }> },
) {
  if (!checkRateLimit(request)) {
    return NextResponse.json({ message: "Muitas consultas. Aguarde um instante." }, { status: 429 });
  }

  const { accessToken } = await params;
  const order = await prisma.eventOrder.findUnique({
    where: { accessToken },
    include: {
      event: { select: { name: true, slug: true, startAt: true, venueName: true } },
      tickets: { select: { id: true } },
      participants: { select: { id: true } },
    },
  });

  if (!order) {
    return NextResponse.json({ message: "Pedido não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    status: order.status,
    eventName: order.event.name,
    eventSlug: order.event.slug,
    eventStartAt: order.event.startAt,
    eventVenueName: order.event.venueName,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    ticketCount: order.tickets.length,
    participantCount: order.participants.length,
    ticketsReady: order.status === "PAID" && order.tickets.length === order.participants.length,
    total: order.total.toFixed(2),
    formattedTotal: formatMoney(order.total),
  });
}
