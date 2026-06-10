import { NextResponse } from "next/server";

import { publicPaymentStatus } from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { message: "Pedido nao encontrado." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        select: {
          id: true,
          productName: true,
          size: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { message: "Pedido nao encontrado." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const firstName = order.customerName.split(" ")[0] || "Cliente";

  return NextResponse.json(
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: publicPaymentStatus(order.paymentStatus),
      orderStatus: order.status.toLowerCase(),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        size: item.size,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.lineTotal),
      })),
      total: Number(order.total),
      buyer: {
        name: firstName,
        cpf: order.customerCpfLast4 ? `***.***.***-${order.customerCpfLast4}` : null,
      },
      createdAt: order.createdAt.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
