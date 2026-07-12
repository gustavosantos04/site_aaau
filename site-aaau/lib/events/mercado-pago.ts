import { EventPaymentPreferenceStatus, Prisma } from "@prisma/client";

import {
  fetchMercadoPagoPayment,
  getBaseUrl,
  onlyDigits,
  type MercadoPagoPayment,
} from "@/lib/checkout/mercado-pago";
import { prisma } from "@/lib/db/prisma";
import {
  EventOrderExpiredError,
  EventOrderInvalidStatusError,
  EventOrderNotFoundError,
  EventPaymentPreferenceAmbiguousError,
  EventPaymentPreferenceCreatingError,
  EventPaymentPreferenceError,
  FreeEventOrderUnsupportedError,
  LateApprovedPaymentError,
  PaymentAmountMismatchError,
  PaymentIdConflictError,
} from "@/lib/events/errors";
import { ensureEventTicketConfirmationEmail } from "@/lib/events/email";
import { assertSameMoney, toMoney } from "@/lib/events/money";
import { buildMercadoPagoNotificationUrl, getConfiguredBaseUrl } from "@/lib/site-url";
import {
  confirmEventOrderPayment,
  expireEventOrderReservation,
} from "@/lib/events/orders";

type CreateEventPreferenceInput = {
  eventOrderId: string;
  request?: Request;
  baseUrl?: string;
  now?: Date;
};

export type EventPaymentProcessingResult =
  | "CONFIRMED"
  | "ALREADY_PROCESSED"
  | "IGNORED_STATUS"
  | "AMOUNT_MISMATCH"
  | "EXTERNAL_REFERENCE_MISMATCH"
  | "INVALID_PAYMENT"
  | "LATE_APPROVED"
  | "PAYMENT_ID_CONFLICT";

const NON_CONFIRMING_PAYMENT_STATUSES = new Set([
  "pending",
  "in_process",
  "rejected",
  "cancelled",
  "canceled",
  "refunded",
  "charged_back",
]);
const EVENT_PAYMENT_PREFERENCE_CREATION_LEASE_MS = 30_000;

type EventOrderForPreference = NonNullable<
  Awaited<ReturnType<typeof loadEventOrderForPreference>>
>;

type MercadoPagoPreferenceCandidate = {
  id?: string;
  external_reference?: string;
  init_point?: string;
  sandbox_init_point?: string;
  items?: Array<{
    quantity?: number | string;
    unit_price?: number | string;
  }>;
};

function decimalToMercadoPagoNumber(value: Prisma.Decimal) {
  return Number(toMoney(value).toFixed(2));
}

function getEventBaseUrl(input: CreateEventPreferenceInput) {
  if (input.baseUrl) {
    return input.baseUrl.replace(/\/$/, "");
  }

  if (input.request) {
    return getBaseUrl(input.request);
  }

  return getConfiguredBaseUrl();
}

function getMercadoPagoAccessToken() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new EventPaymentPreferenceError("Mercado Pago access token nao configurado.");
  }

  return accessToken;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redactPayment(payment: MercadoPagoPayment) {
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
  };
}

export function parseEventOrderExternalReference(value?: string | null) {
  if (!value?.startsWith("event_order:")) {
    return null;
  }

  const eventOrderId = value.slice("event_order:".length).trim();
  return eventOrderId || null;
}

function parsePaymentAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return toMoney(new Prisma.Decimal(value.toString()));
  }

  if (typeof value === "string" && value.trim()) {
    return toMoney(new Prisma.Decimal(value.trim()));
  }

  return null;
}

async function loadEventOrderForPreference(eventOrderId: string) {
  return prisma.eventOrder.findUnique({
    where: { id: eventOrderId },
    include: {
      event: true,
      participants: true,
    },
  });
}

function assertEventOrderCanHavePreference(order: EventOrderForPreference, now: Date) {
  if (order.status !== "PENDING") {
    throw new EventOrderInvalidStatusError();
  }

  if (order.expiresAt <= now) {
    throw new EventOrderExpiredError();
  }

  if (order.participants.length < 1) {
    throw new EventOrderInvalidStatusError();
  }

  if (toMoney(order.total).lessThanOrEqualTo(0)) {
    throw new FreeEventOrderUnsupportedError();
  }
}

function isPreferenceCreationLeaseFresh(order: EventOrderForPreference, now: Date) {
  return Boolean(
    order.paymentPreferenceCreationStartedAt &&
      now.getTime() - order.paymentPreferenceCreationStartedAt.getTime() <
        EVENT_PAYMENT_PREFERENCE_CREATION_LEASE_MS,
  );
}

function preferenceResponseFromOrder(order: EventOrderForPreference, alreadyCreated = true) {
  if (!order.mercadoPagoPreferenceId || !order.mercadoPagoInitPoint) {
    throw new EventPaymentPreferenceError("Preferencia persistida incompleta.");
  }

  return {
    eventOrderId: order.id,
    preferenceId: order.mercadoPagoPreferenceId,
    initPoint: order.mercadoPagoInitPoint,
    sandboxInitPoint: order.mercadoPagoSandboxInitPoint,
    expiresAt: order.expiresAt,
    alreadyCreated,
  };
}

async function recordPreferenceAudit(input: {
  eventOrderId: string;
  result: string;
  status?: string;
}) {
  await prisma.paymentEvent.create({
    data: {
      eventOrderId: input.eventOrderId,
      provider: "MERCADO_PAGO",
      eventType: "event_preference",
      status: input.status ?? input.result,
      payload: asJson({ result: input.result }),
    },
  });
}

export async function claimEventPaymentPreferenceCreation(eventOrderId: string, now = new Date()) {
  const changed = await prisma.eventOrder.updateMany({
    where: {
      id: eventOrderId,
      status: "PENDING",
      mercadoPagoPreferenceId: null,
      paymentPreferenceStatus: EventPaymentPreferenceStatus.NOT_CREATED,
    },
    data: {
      paymentPreferenceStatus: EventPaymentPreferenceStatus.CREATING,
      paymentPreferenceCreationStartedAt: now,
      paymentPreferenceLastErrorAt: null,
    },
  });

  if (changed.count === 1) {
    await recordPreferenceAudit({
      eventOrderId,
      result: "preference_creation_started",
      status: "CREATING",
    });
  }

  return changed.count === 1;
}

async function createMercadoPagoEventPreference(input: {
  accessToken: string;
  payload: unknown;
}) {
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    throw new EventPaymentPreferenceError("Mercado Pago recusou a criacao da preferencia do evento.");
  }

  return (await response.json()) as {
    id?: string;
    init_point?: string;
    sandbox_init_point?: string;
  };
}

export async function searchMercadoPagoPreferencesByExternalReference(
  externalReference: string,
) {
  const accessToken = getMercadoPagoAccessToken();
  const url = new URL("https://api.mercadopago.com/checkout/preferences/search");
  url.searchParams.set("external_reference", externalReference);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new EventPaymentPreferenceError("Nao foi possivel reconciliar a preferencia no Mercado Pago.");
  }

  const body = (await response.json()) as {
    results?: MercadoPagoPreferenceCandidate[];
    elements?: MercadoPagoPreferenceCandidate[];
  };

  return body.results ?? body.elements ?? [];
}

function preferenceTotal(candidate: MercadoPagoPreferenceCandidate) {
  if (!candidate.items?.length) {
    return null;
  }

  try {
    return candidate.items.reduce((total, item) => {
      const quantity = new Prisma.Decimal(String(item.quantity ?? 1));
      const unitPrice = new Prisma.Decimal(String(item.unit_price ?? 0));
      return total.plus(unitPrice.mul(quantity));
    }, new Prisma.Decimal(0));
  } catch {
    return null;
  }
}

export function isCompatibleEventPreference(
  candidate: MercadoPagoPreferenceCandidate,
  order: Pick<EventOrderForPreference, "externalReference" | "total">,
) {
  if (!candidate.id || !candidate.init_point) {
    return false;
  }

  if (candidate.external_reference !== order.externalReference) {
    return false;
  }

  const total = preferenceTotal(candidate);
  return total ? assertSameMoney(total, order.total) : false;
}

async function persistPreference(input: {
  order: EventOrderForPreference;
  preference: Required<Pick<MercadoPagoPreferenceCandidate, "id" | "init_point">> &
    Pick<MercadoPagoPreferenceCandidate, "sandbox_init_point">;
  alreadyCreated: boolean;
}) {
  const updated = await prisma.eventOrder.update({
    where: { id: input.order.id },
    data: {
      mercadoPagoPreferenceId: input.preference.id,
      mercadoPagoInitPoint: input.preference.init_point,
      mercadoPagoSandboxInitPoint: input.preference.sandbox_init_point ?? null,
      paymentPreferenceStatus: EventPaymentPreferenceStatus.CREATED,
      paymentPreferenceLastErrorAt: null,
    },
    include: {
      event: true,
      participants: true,
    },
  });

  await recordPreferenceAudit({
    eventOrderId: input.order.id,
    result: input.alreadyCreated ? "preference_reconciled" : "preference_created",
    status: "CREATED",
  });

  return preferenceResponseFromOrder(updated, input.alreadyCreated);
}

async function markPreferenceAmbiguous(eventOrderId: string, result = "preference_creation_ambiguous") {
  await prisma.eventOrder.update({
    where: { id: eventOrderId },
    data: {
      paymentPreferenceStatus: EventPaymentPreferenceStatus.AMBIGUOUS,
      paymentPreferenceLastErrorAt: new Date(),
    },
  });
  await recordPreferenceAudit({ eventOrderId, result, status: "AMBIGUOUS" });
}

async function reconcileEventPaymentPreference(order: EventOrderForPreference, now: Date) {
  const candidates = await searchMercadoPagoPreferencesByExternalReference(order.externalReference);
  const compatible = candidates.filter((candidate) => isCompatibleEventPreference(candidate, order));

  if (compatible.length === 1) {
    const preference = compatible[0];
    return persistPreference({
      order,
      preference: {
        id: preference.id!,
        init_point: preference.init_point!,
        sandbox_init_point: preference.sandbox_init_point,
      },
      alreadyCreated: true,
    });
  }

  if (compatible.length > 1) {
    await markPreferenceAmbiguous(order.id, "multiple_compatible_preferences_found");
    throw new EventPaymentPreferenceAmbiguousError();
  }

  if (order.expiresAt <= now) {
    throw new EventOrderExpiredError();
  }

  const reset = await prisma.eventOrder.updateMany({
    where: {
      id: order.id,
      status: "PENDING",
      mercadoPagoPreferenceId: null,
      paymentPreferenceStatus: {
        in: [
          EventPaymentPreferenceStatus.CREATING,
          EventPaymentPreferenceStatus.AMBIGUOUS,
        ],
      },
    },
    data: {
      paymentPreferenceStatus: EventPaymentPreferenceStatus.NOT_CREATED,
      paymentPreferenceCreationStartedAt: null,
    },
  });

  if (reset.count !== 1) {
    throw new EventPaymentPreferenceCreatingError();
  }

  return null;
}

function buildEventPreferencePayload(input: {
  order: EventOrderForPreference;
  baseUrl: string;
  now: Date;
}) {
  return {
    external_reference: input.order.externalReference,
    items: [
      {
        id: input.order.event.id,
        title: `Ingresso - ${input.order.event.name}`,
        description: `${input.order.participants.length} ingresso(s)`,
        currency_id: "BRL",
        quantity: 1,
        unit_price: decimalToMercadoPagoNumber(input.order.total),
      },
    ],
    payer: {
      name: input.order.buyerName,
      email: input.order.buyerEmail,
      identification: input.order.buyerCpf
        ? {
            type: "CPF",
            number: onlyDigits(input.order.buyerCpf),
          }
        : undefined,
    },
    back_urls: {
      success: `${input.baseUrl}/eventos/pagamento/sucesso?eventOrderId=${input.order.id}`,
      pending: `${input.baseUrl}/eventos/pagamento/pendente?eventOrderId=${input.order.id}`,
      failure: `${input.baseUrl}/eventos/pagamento/erro?eventOrderId=${input.order.id}`,
    },
    auto_return: "approved",
    notification_url: buildMercadoPagoNotificationUrl(input.baseUrl),
    expires: true,
    expiration_date_from: input.now.toISOString(),
    expiration_date_to: input.order.expiresAt.toISOString(),
    metadata: {
      event_order_id: input.order.id,
      ticket_event_id: input.order.eventId,
    },
  };
}

async function createClaimedPreference(input: {
  order: EventOrderForPreference;
  baseUrl: string;
  now: Date;
}) {
  const accessToken = getMercadoPagoAccessToken();
  const payload = buildEventPreferencePayload(input);
  let preference: Awaited<ReturnType<typeof createMercadoPagoEventPreference>>;

  try {
    preference = await createMercadoPagoEventPreference({
      accessToken,
      payload,
    });
  } catch (error) {
    if (error instanceof EventPaymentPreferenceError) {
      await prisma.eventOrder.update({
        where: { id: input.order.id },
        data: {
          paymentPreferenceStatus: EventPaymentPreferenceStatus.NOT_CREATED,
          paymentPreferenceCreationStartedAt: null,
          paymentPreferenceLastErrorAt: input.now,
        },
      });
      await recordPreferenceAudit({
        eventOrderId: input.order.id,
        result: "preference_creation_failed_known",
        status: "NOT_CREATED",
      });
      throw error;
    }

    await markPreferenceAmbiguous(input.order.id);
    throw new EventPaymentPreferenceAmbiguousError();
  }

  if (!preference.id || !preference.init_point) {
    await markPreferenceAmbiguous(input.order.id);
    throw new EventPaymentPreferenceAmbiguousError();
  }

  try {
    return await persistPreference({
      order: input.order,
      preference: {
        id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
      },
      alreadyCreated: false,
    });
  } catch {
    await markPreferenceAmbiguous(input.order.id);
    throw new EventPaymentPreferenceAmbiguousError();
  }
}

export async function ensureEventPaymentPreference(input: CreateEventPreferenceInput) {
  const now = input.now ?? new Date();
  const baseUrl = getEventBaseUrl(input);
  let order = await loadEventOrderForPreference(input.eventOrderId);

  if (!order) {
    throw new EventOrderNotFoundError();
  }

  if (order.mercadoPagoPreferenceId && order.mercadoPagoInitPoint) {
    return preferenceResponseFromOrder(order, true);
  }

  assertEventOrderCanHavePreference(order, now);

  if (order.paymentPreferenceStatus === EventPaymentPreferenceStatus.CREATED) {
    throw new EventPaymentPreferenceError("Preferencia criada sem dados persistidos completos.");
  }

  if (order.paymentPreferenceStatus === EventPaymentPreferenceStatus.CREATING) {
    if (isPreferenceCreationLeaseFresh(order, now)) {
      throw new EventPaymentPreferenceCreatingError();
    }

    const reconciled = await reconcileEventPaymentPreference(order, now);
    if (reconciled) return reconciled;
  }

  if (order.paymentPreferenceStatus === EventPaymentPreferenceStatus.AMBIGUOUS) {
    const reconciled = await reconcileEventPaymentPreference(order, now);
    if (reconciled) return reconciled;
  }

  const claimed = await claimEventPaymentPreferenceCreation(order.id, now);

  if (!claimed) {
    order = await loadEventOrderForPreference(order.id);

    if (!order) {
      throw new EventOrderNotFoundError();
    }

    if (order.mercadoPagoPreferenceId && order.mercadoPagoInitPoint) {
      return preferenceResponseFromOrder(order, true);
    }

    if (
      order.paymentPreferenceStatus === EventPaymentPreferenceStatus.CREATING &&
      isPreferenceCreationLeaseFresh(order, now)
    ) {
      throw new EventPaymentPreferenceCreatingError();
    }

    const reconciled = await reconcileEventPaymentPreference(order, now);
    if (reconciled) return reconciled;

    if (!(await claimEventPaymentPreferenceCreation(order.id, now))) {
      throw new EventPaymentPreferenceCreatingError();
    }
  }

  const claimedOrder = await loadEventOrderForPreference(order.id);
  if (!claimedOrder) {
    throw new EventOrderNotFoundError();
  }

  return createClaimedPreference({ order: claimedOrder, baseUrl, now });
}

export async function createEventPaymentPreference(input: CreateEventPreferenceInput) {
  return ensureEventPaymentPreference(input);
}

export async function reconcileAmbiguousEventPaymentPreference(
  eventOrderId: string,
  now = new Date(),
) {
  const order = await loadEventOrderForPreference(eventOrderId);

  if (!order) {
    throw new EventOrderNotFoundError();
  }

  return reconcileEventPaymentPreference(order, now);
}

/*
  Checkout Pro create preference has an external side effect. The coordinator above
  uses database state as the source of concurrency control, then reconciles by
  external_reference instead of issuing another POST when creation is ambiguous.
*/

async function recordEventPayment(input: {
  eventOrderId?: string | null;
  payment: MercadoPagoPayment;
  eventType: string;
  webhookRequestId?: string | null;
  result: EventPaymentProcessingResult;
  amountMatches?: boolean;
}) {
  if (input.webhookRequestId) {
    const existing = await prisma.paymentEvent.findUnique({
      where: { webhookRequestId: input.webhookRequestId },
      select: { id: true },
    });

    if (existing) {
      return;
    }
  }

  const mercadoPagoPaymentId = input.payment.id === undefined ? null : String(input.payment.id);
  const existingEquivalent = mercadoPagoPaymentId
    ? await prisma.paymentEvent.findFirst({
        where: {
          eventOrderId: input.eventOrderId ?? null,
          mercadoPagoPaymentId,
          status: input.payment.status ?? "unknown",
          payload: {
            path: ["result"],
            equals: input.result,
          },
        },
        select: { id: true },
      })
    : null;

  if (existingEquivalent) {
    return;
  }

  await prisma.paymentEvent.create({
    data: {
      eventOrderId: input.eventOrderId ?? null,
      provider: "MERCADO_PAGO",
      eventType: input.eventType,
      mercadoPagoPaymentId,
      webhookRequestId: input.webhookRequestId ?? null,
      status: input.payment.status ?? "unknown",
      payload: asJson({
        result: input.result,
        amountMatches: input.amountMatches,
        payment: redactPayment(input.payment),
      }),
    },
  });
}

export async function processEventPayment(
  payment: MercadoPagoPayment,
  options: { eventType?: string; webhookRequestId?: string | null } = {},
) {
  const eventType = options.eventType ?? "payment";
  const eventOrderId = parseEventOrderExternalReference(payment.external_reference);
  const paymentId = payment.id === undefined ? "" : String(payment.id);

  if (!eventOrderId || !paymentId) {
    await recordEventPayment({
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result: "INVALID_PAYMENT",
    });
    return { result: "INVALID_PAYMENT" as const };
  }

  const order = await prisma.eventOrder.findUnique({
    where: { id: eventOrderId },
    select: {
      id: true,
      externalReference: true,
      total: true,
      status: true,
    },
  });

  if (!order) {
    await recordEventPayment({
      eventOrderId,
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result: "INVALID_PAYMENT",
    });
    return { result: "INVALID_PAYMENT" as const };
  }

  if (order.externalReference !== payment.external_reference) {
    await recordEventPayment({
      eventOrderId: order.id,
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result: "EXTERNAL_REFERENCE_MISMATCH",
    });
    return { result: "EXTERNAL_REFERENCE_MISMATCH" as const };
  }

  const status = payment.status ?? "unknown";

  if (status !== "approved") {
    await recordEventPayment({
      eventOrderId: order.id,
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result: NON_CONFIRMING_PAYMENT_STATUSES.has(status) ? "IGNORED_STATUS" : "IGNORED_STATUS",
    });
    return { result: "IGNORED_STATUS" as const };
  }

  const paidAmount = parsePaymentAmount(payment.transaction_amount);

  if (!paidAmount) {
    await recordEventPayment({
      eventOrderId: order.id,
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result: "INVALID_PAYMENT",
    });
    return { result: "INVALID_PAYMENT" as const };
  }

  if (!assertSameMoney(order.total, paidAmount)) {
    await recordEventPayment({
      eventOrderId: order.id,
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result: "AMOUNT_MISMATCH",
      amountMatches: false,
    });
    return { result: "AMOUNT_MISMATCH" as const };
  }

  try {
    const confirmation = await confirmEventOrderPayment({
      eventOrderId: order.id,
      paymentId,
      paidAmount,
      paidAt: payment.date_approved ? new Date(payment.date_approved) : undefined,
    });

    await prisma.eventOrder.update({
      where: { id: order.id },
      data: {
        mercadoPagoPreferenceId: payment.preference_id ?? undefined,
        paymentMethodId: payment.payment_method_id ?? undefined,
        paymentTypeId: payment.payment_type_id ?? undefined,
        statusDetail: payment.status_detail ?? undefined,
      },
    });

    const result = confirmation.alreadyProcessed ? "ALREADY_PROCESSED" : "CONFIRMED";

    await recordEventPayment({
      eventOrderId: order.id,
      payment,
      eventType,
      webhookRequestId: options.webhookRequestId,
      result,
      amountMatches: true,
    });

    let ticketEmail: Awaited<ReturnType<typeof ensureEventTicketConfirmationEmail>> | null = null;
    if (confirmation.newlyPaid && confirmation.ticketsIssued > 0) {
      try {
        ticketEmail = await ensureEventTicketConfirmationEmail(order.id);
      } catch {
        ticketEmail = { sent: false, skipped: false, reason: "smtp_failed" };
      }
    }

    return { result, confirmation, ticketEmail };
  } catch (error) {
    if (error instanceof LateApprovedPaymentError) {
      await recordEventPayment({
        eventOrderId: order.id,
        payment,
        eventType,
        webhookRequestId: options.webhookRequestId,
        result: "LATE_APPROVED",
        amountMatches: true,
      });
      return { result: "LATE_APPROVED" as const };
    }

    if (error instanceof PaymentAmountMismatchError) {
      await recordEventPayment({
        eventOrderId: order.id,
        payment,
        eventType,
        webhookRequestId: options.webhookRequestId,
        result: "AMOUNT_MISMATCH",
        amountMatches: false,
      });
      return { result: "AMOUNT_MISMATCH" as const };
    }

    if (error instanceof PaymentIdConflictError) {
      await recordEventPayment({
        eventOrderId: order.id,
        payment,
        eventType,
        webhookRequestId: options.webhookRequestId,
        result: "PAYMENT_ID_CONFLICT",
        amountMatches: true,
      });
      return { result: "PAYMENT_ID_CONFLICT" as const };
    }

    throw error;
  }
}

export async function fetchAndProcessEventPayment(
  paymentId: string,
  options: { eventType?: string; webhookRequestId?: string | null } = {},
) {
  const payment = await fetchMercadoPagoPayment(paymentId);
  return processEventPayment(payment, options);
}
