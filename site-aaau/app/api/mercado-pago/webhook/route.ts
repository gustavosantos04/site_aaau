import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  fetchMercadoPagoPayment,
  mapMercadoPagoStatus,
  type MercadoPagoPayment,
} from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

function parseSignature(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = value.split(",");
  const parsed = new Map<string, string>();

  for (const part of parts) {
    const [key, rawPartValue] = part.split("=");
    const partValue = rawPartValue?.trim();

    if (key && partValue) {
      parsed.set(key.trim(), partValue);
    }
  }

  const ts = parsed.get("ts");
  const v1 = parsed.get("v1");

  return ts && v1 ? { ts, v1 } : null;
}

function buildSignatureTemplate({
  dataId,
  requestId,
  ts,
}: {
  dataId?: string | null;
  requestId?: string | null;
  ts?: string | null;
}) {
  return [
    dataId ? `id:${dataId};` : "",
    requestId ? `request-id:${requestId};` : "",
    ts ? `ts:${ts};` : "",
  ].join("");
}

function timingSafeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidSignature(request: Request, dataId: string | null) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim();
  const signature = parseSignature(request.headers.get("x-signature"));
  const requestId = request.headers.get("x-request-id");

  if (!secret || !signature || !requestId) {
    return false;
  }

  const template = buildSignatureTemplate({
    dataId,
    requestId,
    ts: signature.ts,
  });
  const expected = crypto.createHmac("sha256", secret).update(template).digest("hex");

  return timingSafeEqualHex(expected, signature.v1);
}

function redactPayment(payment: MercadoPagoPayment | null) {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    external_reference: payment.external_reference,
    transaction_amount: payment.transaction_amount,
    payment_method_id: payment.payment_method_id,
    payment_type_id: payment.payment_type_id,
    date_approved: payment.date_approved,
    preference_id: payment.preference_id,
    payer: payment.payer?.identification?.type
      ? {
          identification: { type: payment.payer.identification.type },
        }
      : undefined,
  };
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function extractPaymentId(url: URL, payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? payload.data : null;
  const bodyDataId =
    data && "id" in data ? String((data as Record<string, unknown>).id ?? "") : "";

  return String(
    url.searchParams.get("data.id") ??
      url.searchParams.get("id") ??
      bodyDataId ??
      payload.id ??
      "",
  );
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  const url = new URL(request.url);
  const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dataId =
    url.searchParams.get("data.id") ||
    url.searchParams.get("id") ||
    extractPaymentId(url, payload) ||
    null;

  if (!isValidSignature(request, dataId)) {
    return NextResponse.json({ message: "Webhook nao autorizado." }, { status: 401 });
  }

  const webhookRequestId = request.headers.get("x-request-id");

  if (webhookRequestId) {
    const existingEvent = await prisma.paymentEvent.findUnique({
      where: { webhookRequestId },
      select: { id: true },
    });

    if (existingEvent) {
      return NextResponse.json({ ok: true });
    }
  }

  const eventType = String(
    payload.type ?? payload.action ?? url.searchParams.get("type") ?? "payment",
  );
  const paymentId = extractPaymentId(url, payload);

  if (!paymentId) {
    await prisma.paymentEvent.create({
      data: {
        provider: "MERCADO_PAGO",
        eventType,
        webhookRequestId,
        payload: asJson({ raw: payload }),
      },
    });
    return NextResponse.json({ ok: true });
  }

  let payment: MercadoPagoPayment | null = null;

  try {
    payment = await fetchMercadoPagoPayment(paymentId);
  } catch {
    await prisma.paymentEvent.create({
      data: {
        provider: "MERCADO_PAGO",
        eventType,
        mercadoPagoPaymentId: paymentId,
        webhookRequestId,
        status: "payment_fetch_failed",
        payload: asJson({ raw: payload }),
      },
    });
    return NextResponse.json({ ok: true });
  }

  const orderId = payment.external_reference ? String(payment.external_reference) : null;
  const preferenceId = payment.preference_id ? String(payment.preference_id) : null;
  const order = orderId
    ? await prisma.order.findUnique({ where: { id: orderId } })
    : preferenceId
      ? await prisma.order.findFirst({ where: { mercadoPagoPreferenceId: preferenceId } })
      : null;
  const mappedStatus = mapMercadoPagoStatus(payment.status);
  const paidAmount = Number(payment.transaction_amount ?? 0);
  const orderTotal = order ? Number(order.total) : null;
  const amountMatches = orderTotal === null || Math.abs(orderTotal - paidAmount) < 0.01;

  try {
    await prisma.paymentEvent.create({
      data: {
        orderId: order?.id ?? null,
        provider: "MERCADO_PAGO",
        eventType,
        mercadoPagoPaymentId: paymentId,
        webhookRequestId,
        status: payment.status ?? "unknown",
        payload: asJson({
          raw: payload,
          payment: redactPayment(payment),
          amountMatches,
        }),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true });
    }

    throw error;
  }

  if (order && amountMatches) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: mappedStatus.orderStatus,
        paymentStatus: mappedStatus.paymentStatus,
        mercadoPagoPaymentId: paymentId,
        mercadoPagoPreferenceId: preferenceId ?? undefined,
        paymentMethodId: payment.payment_method_id ?? undefined,
        paymentTypeId: payment.payment_type_id ?? undefined,
        statusDetail: payment.status_detail ?? undefined,
        paidAt: payment.date_approved ? new Date(payment.date_approved) : undefined,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  return NextResponse.json(
    { message: "Metodo nao permitido." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
