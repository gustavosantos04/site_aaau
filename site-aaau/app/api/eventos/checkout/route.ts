import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/checkout/mercado-pago";
import {
  checkoutDomainErrorResponse,
  checkoutSchemaValidationResponse,
} from "@/lib/events/checkout-validation";
import { EventDomainError } from "@/lib/events/errors";
import { createEventPaymentPreference } from "@/lib/events/mercado-pago";
import { createEventOrderReservation } from "@/lib/events/orders";

export const runtime = "nodejs";

function emptyOptionalToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

const participantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cpf: z.string().trim().min(11).max(18),
  email: z.preprocess(emptyOptionalToUndefined, z.string().trim().email().max(160).optional()),
  phone: z.preprocess(emptyOptionalToUndefined, z.string().trim().min(10).max(24).optional()),
  birthDate: z.preprocess(
    emptyOptionalToUndefined,
    z.string().date().transform((value) => new Date(`${value}T00:00:00.000Z`)).optional(),
  ),
  institution: z.preprocess(emptyOptionalToUndefined, z.string().trim().max(120).optional()),
  course: z.preprocess(emptyOptionalToUndefined, z.string().trim().max(120).optional()),
  campus: z.preprocess(emptyOptionalToUndefined, z.string().trim().max(120).optional()),
}).strict();

const eventCheckoutSchema = z.object({
  eventId: z.string().trim().min(1).max(160).optional(),
  eventSlug: z.string().trim().min(1).max(180).optional(),
  ticketLotId: z.string().trim().min(1).max(160).optional(),
  commercialUnitQuantity: z.number().int().min(1).max(20).optional(),
  buyer: z.object({
    name: z.string().trim().min(2).max(120),
    cpf: z.string().trim().min(11).max(18).optional(),
    email: z.string().trim().email().max(160),
    phone: z.string().trim().min(10).max(24),
  }).strict(),
  participants: z.array(participantSchema).min(1).max(10),
  partnerCode: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().min(16).max(160),
}).strict().refine((value) => value.eventId || value.eventSlug, {
  message: "Informe o evento.",
  path: ["eventId"],
});

function checkoutLogContext(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    eventId: typeof value.eventId === "string" ? value.eventId : undefined,
    eventSlug: typeof value.eventSlug === "string" ? value.eventSlug : undefined,
    lotId: typeof value.ticketLotId === "string" ? value.ticketLotId : undefined,
    quantity: typeof value.commercialUnitQuantity === "number" ? value.commercialUnitQuantity : undefined,
    participantsCount: Array.isArray(value.participants) ? value.participants.length : undefined,
    hasPartnerCode: typeof value.partnerCode === "string" && value.partnerCode.trim().length > 0,
  };
}

function logCheckoutRejected(body: unknown, reason: string, details?: unknown) {
  console.warn("[EVENT_CHECKOUT_REJECTED]", {
    reason,
    ...checkoutLogContext(body),
    details,
  });
}

export async function POST(request: Request) {
  const databaseConfigured = Boolean(
    process.env.DATABASE_URL ||
    (process.env.NODE_ENV === "test" && process.env.TEST_DATABASE_URL),
  );
  if (!databaseConfigured) {
    return NextResponse.json(
      { code: "CHECKOUT_UNAVAILABLE", message: "O checkout está indisponível agora. Tente novamente em alguns instantes." },
      { status: 503 },
    );
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { code: "CHECKOUT_RATE_LIMITED", message: "Muitas tentativas de checkout. Aguarde um instante." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = eventCheckoutSchema.safeParse(body);

  if (!parsed.success) {
    logCheckoutRejected(body, "SCHEMA_VALIDATION", parsed.error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
    })));
    const response = checkoutSchemaValidationResponse(parsed.error.issues);
    return NextResponse.json(response.body, { status: response.status });
  }

  try {
    const reservation = await createEventOrderReservation({
      eventId: parsed.data.eventId,
      slug: parsed.data.eventSlug,
      ticketLotId: parsed.data.ticketLotId,
      commercialUnitQuantity: parsed.data.commercialUnitQuantity,
      buyer: parsed.data.buyer,
      participants: parsed.data.participants,
      partnerCode: parsed.data.partnerCode,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    const preference = await createEventPaymentPreference({
      eventOrderId: reservation.orderId,
      request,
    });

    return NextResponse.json(
      {
        eventOrderId: reservation.orderId,
        accessToken: reservation.accessToken,
        preferenceId: preference.preferenceId,
        initPoint: preference.initPoint,
        sandboxInitPoint: preference.sandboxInitPoint,
        expiresAt: preference.expiresAt,
      },
      { status: reservation.alreadyCreated || preference.alreadyCreated ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof EventDomainError) {
      const response = checkoutDomainErrorResponse(error);
      if (response.status < 500) {
        logCheckoutRejected(body, error.code, error.details);
      } else {
        console.error("[EVENT_CHECKOUT_FAILED]", { reason: error.code, ...checkoutLogContext(body) });
      }
      return NextResponse.json(response.body, { status: response.status });
    }

    console.error("[EVENT_CHECKOUT_FAILED]", { reason: "UNEXPECTED_ERROR", ...checkoutLogContext(body) });
    return NextResponse.json(
      { code: "CHECKOUT_INTERNAL_ERROR", message: "Não foi possível iniciar o pagamento agora. Tente novamente em alguns instantes." },
      { status: 500 },
    );
  }
}
