import { NextResponse } from "next/server";
import { OrderStatus, PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

function mapPaymentStatus(status?: string) {
  switch (status) {
    case "approved":
      return { paymentStatus: PaymentStatus.APPROVED, orderStatus: OrderStatus.PAID };
    case "rejected":
      return { paymentStatus: PaymentStatus.REJECTED, orderStatus: OrderStatus.FAILED };
    case "cancelled":
    case "canceled":
      return { paymentStatus: PaymentStatus.CANCELED, orderStatus: OrderStatus.CANCELED };
    case "refunded":
      return { paymentStatus: PaymentStatus.REFUNDED, orderStatus: OrderStatus.CANCELED };
    case "pending":
    case "in_process":
      return { paymentStatus: PaymentStatus.PENDING, orderStatus: OrderStatus.PENDING };
    default:
      return { paymentStatus: PaymentStatus.UNKNOWN, orderStatus: OrderStatus.PENDING };
  }
}

async function fetchMercadoPagoPayment(paymentId: string) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    return null;
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as {
    id?: number | string;
    status?: string;
    external_reference?: string;
    preference_id?: string;
  };
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  const url = new URL(request.url);
  const configuredSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();

  if (configuredSecret && url.searchParams.get("secret") !== configuredSecret) {
    return NextResponse.json({ message: "Webhook nao autorizado." }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const eventType =
    payload.type ?? payload.action ?? url.searchParams.get("type") ?? "mercado_pago_webhook";
  const paymentId = String(payload.data?.id ?? payload.id ?? url.searchParams.get("data.id") ?? "");
  const payment = paymentId ? await fetchMercadoPagoPayment(paymentId) : null;
  const orderId = payment?.external_reference ?? payload.external_reference ?? null;
  const preferenceId = payment?.preference_id ?? payload.preference_id ?? null;
  const status = mapPaymentStatus(payment?.status ?? payload.status);

  const order = orderId
    ? await prisma.order.findUnique({ where: { id: String(orderId) }, select: { id: true } })
    : preferenceId
      ? await prisma.order.findFirst({
          where: { mercadoPagoPreferenceId: String(preferenceId) },
          select: { id: true },
        })
      : null;

  await prisma.paymentEvent.create({
    data: {
      orderId: order?.id ?? null,
      provider: "MERCADO_PAGO",
      eventType: String(eventType),
      payload: {
        raw: payload,
        payment,
      },
    },
  });

  if (order) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: status.orderStatus,
        paymentStatus: status.paymentStatus,
        mercadoPagoPaymentId: paymentId || undefined,
        mercadoPagoPreferenceId: preferenceId ? String(preferenceId) : undefined,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  return POST(request);
}
