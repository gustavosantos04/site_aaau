import crypto from "node:crypto";

import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { productsSeed } from "@/lib/data/seed-content";
import { prisma } from "@/lib/db/prisma";

const MAX_ITEMS = 12;
const MAX_QUANTITY = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 8;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const checkoutItemSchema = z.object({
  productId: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(180).optional(),
  quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY),
  size: z.string().trim().max(24).optional(),
  variantId: z.string().trim().max(80).optional(),
  optionId: z.string().trim().max(80).optional(),
  optionValueId: z.string().trim().max(80).optional(),
  customName: z.string().trim().max(18).optional(),
  customNumber: z.string().trim().regex(/^\d{1,2}$/).optional(),
});

const buyerSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  cpf: z.string().trim().min(11).max(18),
  email: z.string().trim().email().max(160),
  whatsapp: z.string().trim().min(10).max(24),
  campus: z.string().trim().min(2).max(80),
});

export const checkoutSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const input = raw as Record<string, unknown>;
  const buyer = (input.buyer && typeof input.buyer === "object" ? input.buyer : {}) as Record<
    string,
    unknown
  >;

  return {
    ...input,
    buyer: {
      fullName: buyer.fullName ?? input.buyerName,
      cpf: buyer.cpf ?? input.buyerCpf,
      email: buyer.email ?? input.buyerEmail,
      whatsapp: buyer.whatsapp ?? input.buyerWhatsapp,
      campus: buyer.campus ?? input.buyerCampus,
    },
  };
}, z.object({
  idempotencyKey: z.string().trim().min(16).max(160).optional(),
  notes: z.string().trim().max(600).optional(),
  buyer: buyerSchema,
  items: z.array(checkoutItemSchema).min(1).max(MAX_ITEMS),
}));

export type CheckoutPayload = z.infer<typeof checkoutSchema>;

export type MercadoPagoPayment = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string;
  preference_id?: string;
  payer?: {
    email?: string;
    identification?: {
      type?: string;
      number?: string;
    };
  };
};

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function sanitizeText(value: string) {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

export function isValidCpf(value: string) {
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

export function cpfHash(cpf: string) {
  return crypto.createHash("sha256").update(onlyDigits(cpf)).digest("hex");
}

export function publicPaymentStatus(status: PaymentStatus) {
  switch (status) {
    case PaymentStatus.APPROVED:
      return "approved";
    case PaymentStatus.REJECTED:
      return "rejected";
    case PaymentStatus.CANCELED:
      return "cancelled";
    case PaymentStatus.REFUNDED:
      return "refunded";
    case PaymentStatus.EXPIRED:
      return "expired";
    case PaymentStatus.PENDING:
      return "pending";
    default:
      return "pending";
  }
}

export function mapMercadoPagoStatus(status?: string) {
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
    case "expired":
      return { paymentStatus: PaymentStatus.EXPIRED, orderStatus: OrderStatus.CANCELED };
    case "pending":
    case "in_process":
      return { paymentStatus: PaymentStatus.PENDING, orderStatus: OrderStatus.PENDING };
    default:
      return { paymentStatus: PaymentStatus.UNKNOWN, orderStatus: OrderStatus.PENDING };
  }
}

export function getBaseUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    request.headers.get("origin")?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

export function buildOrderNumber() {
  const now = new Date();
  const datePart = [
    now.getFullYear().toString().slice(2),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `AAAU-${datePart}-${randomPart}`;
}

export function checkRateLimit(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new Error("Mercado Pago access token nao configurado.");
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o pagamento no Mercado Pago.");
  }

  return (await response.json()) as MercadoPagoPayment;
}

async function createMercadoPagoPreference({
  request,
  orderId,
  buyer,
  items,
  idempotencyKey,
}: {
  request: Request;
  orderId: string;
  buyer: CheckoutPayload["buyer"];
  items: Array<{ title: string; quantity: number; unit_price: number }>;
  idempotencyKey?: string;
}) {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new Error("Mercado Pago access token nao configurado.");
  }

  const baseUrl = getBaseUrl(request);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (idempotencyKey) {
    headers["X-Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers,
    body: JSON.stringify({
      external_reference: orderId,
      items: items.map((item) => ({ ...item, currency_id: "BRL" })),
      payer: {
        name: buyer.fullName,
        email: buyer.email,
        identification: {
          type: "CPF",
          number: onlyDigits(buyer.cpf),
        },
      },
      back_urls: {
        success: `${baseUrl}/pagamento/sucesso?orderId=${orderId}`,
        failure: `${baseUrl}/pagamento/erro?orderId=${orderId}`,
        pending: `${baseUrl}/pagamento/pendente?orderId=${orderId}`,
      },
      auto_return: "approved",
      notification_url: `${baseUrl}/api/mercado-pago/webhook`,
      metadata: {
        order_id: orderId,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Mercado Pago recusou a criacao da preferencia.");
  }

  return (await response.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };
}

export async function createCheckout(request: Request) {
  if (!process.env.DATABASE_URL) {
    return { error: "Banco de dados nao configurado para criar pedidos.", status: 503 };
  }

  if (!checkRateLimit(request)) {
    return { error: "Muitas tentativas de checkout. Aguarde um instante.", status: 429 };
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return { error: "Revise os dados obrigatorios do checkout.", status: 400 };
  }

  const data = parsed.data;
  const cpf = onlyDigits(data.buyer.cpf);
  const whatsapp = onlyDigits(data.buyer.whatsapp);

  if (!isValidCpf(cpf)) {
    return { error: "CPF invalido.", status: 400 };
  }

  if (whatsapp.length < 10 || whatsapp.length > 13) {
    return { error: "WhatsApp invalido.", status: 400 };
  }

  const checkoutSessionKey = data.idempotencyKey ?? null;

  if (checkoutSessionKey) {
    const existing = await prisma.order.findUnique({
      where: { checkoutSessionKey },
      select: {
        id: true,
        mercadoPagoInitPoint: true,
      },
    });

    if (existing) {
      if (existing.mercadoPagoInitPoint) {
        return {
          data: {
            orderId: existing.id,
            initPoint: existing.mercadoPagoInitPoint,
          },
          status: 200,
        };
      }

      await prisma.order.update({
        where: { id: existing.id },
        data: { checkoutSessionKey: null },
      });
    }
  }

  const productIds = [...new Set(data.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      isActive: true,
    },
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productMetadataById = new Map(productsSeed.map((product) => [product.id, product]));

  if (products.length !== productIds.length) {
    return { error: "Um ou mais produtos nao estao disponiveis para compra.", status: 400 };
  }

  for (const item of data.items) {
    const product = productsById.get(item.productId);

    if (!product) {
      return { error: "Produto indisponivel.", status: 400 };
    }

    if (item.quantity > product.stock) {
      return { error: `Estoque insuficiente para ${product.name}.`, status: 400 };
    }

    if (product.sizes.length > 0 && !item.size) {
      return { error: `Escolha um tamanho para ${product.name}.`, status: 400 };
    }

    if (item.size && product.sizes.length > 0 && !product.sizes.includes(item.size)) {
      return { error: `Tamanho invalido para ${product.name}.`, status: 400 };
    }

    const metadata = productMetadataById.get(product.id);
    const selectedVariant = item.variantId
      ? metadata?.variants?.find((variant) => variant.id === item.variantId)
      : undefined;

    if (metadata?.variants?.length) {
      if (!item.variantId) {
        return { error: `Escolha uma opcao para ${product.name}.`, status: 400 };
      }

      if (!selectedVariant) {
        return { error: `Opcao invalida para ${product.name}.`, status: 400 };
      }
    }

    const requiredOptionIds = metadata?.variants?.length
      ? selectedVariant?.requiredOptionIds ?? []
      : metadata?.options?.filter((option) => option.required).map((option) => option.id) ?? [];

    for (const optionId of requiredOptionIds) {
      const option = metadata?.options?.find((entry) => entry.id === optionId);

      if (!option || item.optionId !== option.id || !item.optionValueId) {
        return { error: `Escolha ${option?.label.toLowerCase() ?? "a opcao"} para ${product.name}.`, status: 400 };
      }

      if (!option.values.some((value) => value.id === item.optionValueId)) {
        return { error: `Opcao invalida para ${product.name}.`, status: 400 };
      }
    }

    if (product.requiresCustomization && (!item.customName?.trim() || !item.customNumber?.trim())) {
      return { error: `Informe nome e numero para ${product.name}.`, status: 400 };
    }
  }

  const orderItems = data.items.map((item) => {
    const product = productsById.get(item.productId);

    if (!product) {
      throw new Error("Produto indisponivel.");
    }

    const metadata = productMetadataById.get(product.id);
    const variant = item.variantId
      ? metadata?.variants?.find((entry) => entry.id === item.variantId)
      : undefined;
    const option = item.optionId
      ? metadata?.options?.find((entry) => entry.id === item.optionId)
      : undefined;
    const optionValue = item.optionValueId
      ? option?.values.find((entry) => entry.id === item.optionValueId)
      : undefined;
    const unitPrice = variant?.price ?? Number(product.price);
    const totalPrice = unitPrice * item.quantity;

    return {
      product,
      productName: [
        product.name,
        variant?.label,
        option && optionValue ? `${option.label}: ${optionValue.label}` : null,
      ]
        .filter(Boolean)
        .join(" - "),
      size: item.size ? sanitizeText(item.size) : null,
      customName: item.customName ? sanitizeText(item.customName) : null,
      customNumber: item.customNumber ? sanitizeText(item.customNumber) : null,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
    };
  });
  const subtotal = orderItems.reduce((acc, item) => acc + item.totalPrice, 0);

  try {
    const order = await prisma.order.create({
      data: {
        orderNumber: buildOrderNumber(),
        checkoutSessionKey,
        customerName: sanitizeText(data.buyer.fullName),
        customerCpf: null,
        customerCpfHash: cpfHash(cpf),
        customerCpfLast4: cpf.slice(-4),
        customerEmail: data.buyer.email.toLowerCase(),
        customerPhone: whatsapp,
        customerCampus: sanitizeText(data.buyer.campus),
        notes: data.notes ? sanitizeText(data.notes) : null,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: new Prisma.Decimal(subtotal),
        discount: new Prisma.Decimal(0),
        total: new Prisma.Decimal(subtotal),
        items: {
          create: orderItems.map((item) => ({
            product: { connect: { id: item.product.id } },
            productName: item.productName,
            productSlug: item.product.slug,
            size: item.size,
            customName: item.customName,
            customNumber: item.customNumber,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            lineTotal: new Prisma.Decimal(item.totalPrice),
          })),
        },
      },
      include: { items: true },
    });

    const preference = await createMercadoPagoPreference({
      request,
      orderId: order.id,
      buyer: data.buyer,
      idempotencyKey: checkoutSessionKey ?? undefined,
      items: order.items.map((item) => ({
        title: [
          item.productName,
          item.size ? `Tam ${item.size}` : null,
          item.customName ? `Nome ${item.customName}` : null,
          item.customNumber ? `Numero ${item.customNumber}` : null,
        ]
          .filter(Boolean)
          .join(" - "),
        quantity: item.quantity,
        unit_price: Number(item.unitPrice),
      })),
    });
    const useSandbox = process.env.MERCADO_PAGO_ACCESS_TOKEN?.startsWith("TEST-");
    const initPoint =
      (useSandbox ? preference.sandbox_init_point : preference.init_point) ??
      preference.init_point ??
      preference.sandbox_init_point;

    if (!preference.id || !initPoint) {
      throw new Error("Preferencia Mercado Pago sem link de checkout.");
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        mercadoPagoPreferenceId: preference.id,
        mercadoPagoInitPoint: initPoint,
        paymentStatus: PaymentStatus.PENDING,
      },
    });

    return {
      data: {
        orderId: order.id,
        initPoint,
      },
      status: 200,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Checkout ja iniciado. Tente atualizar a pagina.", status: 409 };
    }

    return {
      error: "Nao foi possivel iniciar o pagamento agora.",
      status: 500,
    };
  }
}
