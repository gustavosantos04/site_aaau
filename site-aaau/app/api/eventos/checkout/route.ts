import { NextResponse } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/checkout/mercado-pago";
import { EventDomainError } from "@/lib/events/errors";
import { createEventPaymentPreference } from "@/lib/events/mercado-pago";
import { createEventOrderReservation } from "@/lib/events/orders";

export const runtime = "nodejs";

const participantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  cpf: z.string().trim().min(11).max(18),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().min(10).max(24).optional(),
  birthDate: z.coerce.date().optional(),
  institution: z.string().trim().max(120).optional(),
  course: z.string().trim().max(120).optional(),
  campus: z.string().trim().max(120).optional(),
});

const eventCheckoutSchema = z.object({
  eventId: z.string().trim().min(1).max(160).optional(),
  eventSlug: z.string().trim().min(1).max(180).optional(),
  buyer: z.object({
    name: z.string().trim().min(2).max(120),
    cpf: z.string().trim().min(11).max(18).optional(),
    email: z.string().trim().email().max(160),
    phone: z.string().trim().min(10).max(24),
  }),
  participants: z.array(participantSchema).min(1).max(10),
  partnerCode: z.string().trim().max(80).optional(),
  idempotencyKey: z.string().trim().min(16).max(160),
}).refine((value) => value.eventId || value.eventSlug, {
  message: "Informe o evento.",
  path: ["eventId"],
});

function statusFromDomainError(error: EventDomainError) {
  switch (error.code) {
    case "EVENT_NOT_FOUND":
      return 404;
    case "IDEMPOTENCY_CONFLICT":
      return 409;
    case "INSUFFICIENT_TICKET_AVAILABILITY":
    case "NO_ACTIVE_TICKET_LOT":
    case "PARTNER_CODE_LIMIT_REACHED":
    case "EVENT_ORDER_EXPIRED":
    case "EVENT_ORDER_INVALID_STATUS":
      return 409;
    case "FREE_EVENT_ORDER_UNSUPPORTED":
      return 422;
    case "EVENT_PAYMENT_PREFERENCE_CREATING":
      return 202;
    case "EVENT_PAYMENT_PREFERENCE_AMBIGUOUS":
      return 409;
    default:
      return 400;
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: "Banco de dados nao configurado." }, { status: 503 });
  }

  if (!checkRateLimit(request)) {
    return NextResponse.json(
      { message: "Muitas tentativas de checkout. Aguarde um instante." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = eventCheckoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "Revise os dados obrigatorios do checkout." }, { status: 400 });
  }

  try {
    const reservation = await createEventOrderReservation({
      eventId: parsed.data.eventId,
      slug: parsed.data.eventSlug,
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
      return NextResponse.json(
        {
          message: error.message,
          code: error.code,
          retryable: error.code === "EVENT_PAYMENT_PREFERENCE_CREATING",
        },
        { status: statusFromDomainError(error) },
      );
    }

    return NextResponse.json(
      { message: "Nao foi possivel iniciar o pagamento do evento agora." },
      { status: 500 },
    );
  }
}
