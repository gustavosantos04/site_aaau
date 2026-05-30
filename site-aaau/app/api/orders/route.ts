import { NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";

const checkoutSchema = z.object({
  buyerName: z.string().trim().min(3),
  buyerCpf: z.string().trim().min(11),
  buyerEmail: z.string().trim().email(),
  buyerWhatsapp: z.string().trim().min(10),
  buyerCampus: z.string().trim().min(2),
  notes: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        slug: z.string().min(1),
        size: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      }),
    )
    .min(1),
});

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }
  let digit = (sum * 10) % 11;
  if (digit === 10) {
    digit = 0;
  }
  if (digit !== Number(cpf[9])) {
    return false;
  }

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }
  digit = (sum * 10) % 11;
  if (digit === 10) {
    digit = 0;
  }

  return digit === Number(cpf[10]);
}

function buildOrderNumber() {
  const now = new Date();
  const datePart = [
    now.getFullYear().toString().slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `AAAU-${datePart}-${randomPart}`;
}

function getBaseUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    request.headers.get("origin") ||
    "http://localhost:3000"
  );
}

async function createMercadoPagoPreference({
  request,
  orderId,
  orderNumber,
  buyerEmail,
  items,
}: {
  request: Request;
  orderId: string;
  orderNumber: string;
  buyerEmail: string;
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
  }>;
}) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    return null;
  }

  const baseUrl = getBaseUrl(request);
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_reference: orderId,
      items,
      payer: {
        email: buyerEmail,
      },
      back_urls: {
        success: `${baseUrl}/pedido/confirmado?pedido=${orderNumber}`,
        pending: `${baseUrl}/pedido/confirmado?pedido=${orderNumber}`,
        failure: `${baseUrl}/checkout?pedido=${orderNumber}`,
      },
      notification_url: `${baseUrl}/api/mercado-pago/webhook`,
      metadata: {
        order_id: orderId,
        order_number: orderNumber,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Mercado Pago recusou a criacao da preferencia.");
  }

  return (await response.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { message: "Banco de dados nao configurado para criar pedidos." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "Revise os dados obrigatorios do checkout." },
      { status: 400 },
    );
  }

  const data = parsed.data;

  if (!isValidCpf(data.buyerCpf)) {
    return NextResponse.json({ message: "CPF invalido." }, { status: 400 });
  }

  const productIds = [...new Set(data.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      isActive: true,
    },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { message: "Um ou mais produtos nao estao disponiveis para compra." },
      { status: 400 },
    );
  }

  const orderItems = data.items.map((item) => {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error("Produto indisponivel.");
    }

    if (item.quantity > product.stock) {
      throw new Error(`Estoque insuficiente para ${product.name}.`);
    }

    const unitPrice = Number(product.price);
    const totalPrice = unitPrice * item.quantity;

    return {
      product,
      size: item.size,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
    };
  });
  const subtotal = orderItems.reduce((acc, item) => acc + item.totalPrice, 0);
  const orderNumber = buildOrderNumber();

  try {
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerName: data.buyerName,
        customerCpf: onlyDigits(data.buyerCpf),
        customerEmail: data.buyerEmail,
        customerPhone: onlyDigits(data.buyerWhatsapp),
        customerCampus: data.buyerCampus,
        notes: data.notes || null,
        status: "PENDING",
        paymentStatus: "PENDING",
        subtotal,
        discount: 0,
        total: subtotal,
        items: {
          create: orderItems.map((item) => ({
            productId: item.product.id,
            productName: item.product.name,
            productSlug: item.product.slug,
            size: item.size,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.totalPrice,
          })),
        },
      },
      include: { items: true },
    });

    let checkoutUrl: string | null = null;
    let preferenceId: string | null = null;

    try {
      const preference = await createMercadoPagoPreference({
        request,
        orderId: order.id,
        orderNumber: order.orderNumber,
        buyerEmail: order.customerEmail,
        items: order.items.map((item) => ({
          title: item.productName,
          quantity: item.quantity,
          unit_price: Number(item.unitPrice),
        })),
      });

      if (preference?.id) {
        preferenceId = preference.id;
        checkoutUrl = preference.init_point ?? preference.sandbox_init_point ?? null;

        await prisma.order.update({
          where: { id: order.id },
          data: {
            mercadoPagoPreferenceId: preference.id,
            paymentStatus: PaymentStatus.PENDING,
          },
        });
      }
    } catch (error) {
      await prisma.paymentEvent.create({
        data: {
          orderId: order.id,
          provider: "MERCADO_PAGO",
          eventType: "preference_error",
          payload: {
            message: error instanceof Error ? error.message : "Erro desconhecido",
          },
        },
      });
    }

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      preferenceId,
      checkoutUrl,
      message: checkoutUrl
        ? "Pedido criado. Redirecionando para pagamento."
        : "Pedido pendente criado. Configure o Mercado Pago para redirecionar ao checkout.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Nao foi possivel criar o pedido agora.",
      },
      { status: 400 },
    );
  }
}
