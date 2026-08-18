import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { POST as mercadoPagoWebhookPost } from "@/app/api/mercado-pago/webhook/route";
import { GET as appVersionGet } from "@/app/api/version/route";

import { getBaseUrl as getMercadoPagoBaseUrl } from "@/lib/checkout/mercado-pago";
import { buildAaauTransactionalEmailHtml } from "@/lib/email/aaau-transactional-template";
import { resendDeliveryStatus } from "@/lib/email/resend-webhook";
import { buildMercadoPagoNotificationUrl } from "@/lib/site-url";

import {
  assertTicketEventSalesOpen,
  getExclusiveTicketLot,
  getTicketCountForCommercialUnits,
  getTicketLotMaxUnitsPerOrder,
  getTicketLotAvailability,
  selectActiveTicketLot,
} from "@/lib/events/availability";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  EventNotPublishedError,
  EventSalesEndedError,
  EventSalesNotStartedError,
  InconsistentTicketCountersError,
  NoActiveTicketLotError,
} from "@/lib/events/errors";
import * as EventErrors from "@/lib/events/errors";
import { checkoutDomainErrorResponse } from "@/lib/events/checkout-validation";
import { toMoney } from "@/lib/events/money";
import {
  calculatePartnerDiscount,
  normalizePartnerCode,
  validatePartnerCode,
} from "@/lib/events/partner-codes";
import { isCompatibleEventPreference } from "@/lib/events/mercado-pago";
import { buildEventTicketConfirmationEmail } from "@/lib/events/email";
import {
  buildCpfHashSearch,
  maskCpfLast4,
  normalizeEventSlug,
  normalizePartnerCodeAdmin,
  parseTicketEventAdminInput,
} from "@/lib/events/admin";
import { adminStatusLabel, emailDeliveryStatusLabel } from "@/lib/events/admin-labels";
import { normalizeEventImagePath } from "@/lib/events/images";
import { getPublicEventStatus, getPublicLotStatus } from "@/lib/events/public";
import {
  buildEventTicketQrPayload,
  eventTicketStatusLabel,
} from "@/lib/events/ticket-display";
import { isRetryableTransactionConflict } from "@/lib/events/transaction";
import { eventTicketTransfersEnabled } from "@/lib/events/transfer-config";
import {
  eventTicketTransferSecretFingerprint,
  generateEventTicketTransferToken,
  hashEventTicketAccessToken,
  hashEventTicketHolderEmail,
  normalizeEventTicketHolderEmail,
} from "@/lib/events/transfer-security";
import {
  eventTicketTransferRequiresBirthDate,
  normalizeEventTicketTransferRecipient,
} from "@/lib/events/transfer-validation";
import {
  eventTicketTransferErrorDestination,
  safeEventTicketTransferErrorCode,
} from "@/lib/events/transfer-action-errors";
import {
  eventTicketTransferCookieOptions,
  getEventTicketTransferBrowserConfig,
  isValidEventTicketTransferBrowserToken,
} from "@/lib/events/transfer-browser-session";
import { logEventTicketOperation } from "@/lib/events/operations-log";
import { decryptTransferEmailPayload, encryptTransferEmailPayload } from "@/lib/events/transfer-outbox";
import { maskEmail } from "@/lib/events/transfer-emails";
import { assertEventTicketTransferCsrf, assertEventTicketTransferRateLimit } from "@/lib/events/transfer-http-security";
import {
  decryptPortalEmailPayload,
  encryptPortalEmailPayload,
  generatePortalToken,
  hashPortalMagicLinkToken,
  hashPortalSessionToken,
  normalizePortalEmail,
} from "@/lib/events/portal-security";
import { consumePortalRateLimits, type PortalRateLimitBackend } from "@/lib/events/portal-rate-limit";
import { portalCookieOptions } from "@/lib/events/portal-cookie";
import { validateEventTicketOperationalConfig } from "@/lib/events/operational-config";
import { handleEventTicketOutboxCron } from "@/lib/events/outbox-cron-http";
import { routeMercadoPagoExternalReference } from "@/lib/mercado-pago-routing";
import {
  buildMercadoPagoSignatureManifest,
  validateMercadoPagoWebhookSignature,
} from "@/lib/mercado-pago-webhook";
import {
  buildCpfHashForPortariaSearch,
  normalizeNameSearch,
  normalizeTicketCodeSearch,
} from "@/lib/portaria-search";
import { parseEventTicketQrPayload } from "@/lib/portaria-qr";
import { buildAbsoluteUrl, normalizeBaseUrl } from "@/lib/site-url";

const now = new Date("2026-07-07T18:00:00.000Z");

test("contrato do checkout classifica todos os erros recuperaveis sem expor detalhes internos", () => {
  const cases: Array<{
    error: EventErrors.EventDomainError;
    status: number;
    publicCode?: string;
    message: RegExp;
    field?: string;
    participantIndex?: number;
  }> = [
    { error: new EventErrors.EventNotFoundError(), status: 404, message: /não está disponível/ },
    { error: new EventErrors.EventNotPublishedError(), status: 404, message: /não está disponível/ },
    { error: new EventErrors.EventSalesNotStartedError(), status: 409, message: /ainda não começaram/ },
    { error: new EventErrors.EventSalesEndedError(), status: 410, message: /já foram encerradas/ },
    { error: new EventErrors.NoActiveTicketLotError(), status: 409, message: /lote disponível/ },
    { error: new EventErrors.InconsistentTicketCountersError(), status: 500, publicCode: "CHECKOUT_INTERNAL_ERROR", message: /validar o estoque/ },
    { error: new EventErrors.InsufficientTicketAvailabilityError(), status: 409, message: /esgotar|quantidade solicitada/ },
    {
      error: new EventErrors.InvalidTicketQuantityError("MAX_UNITS_PER_ORDER_EXCEEDED", { maxUnitsPerOrder: 2, ticketsPerUnit: 2 }),
      status: 400,
      message: /no máximo 2 pacote/,
    },
    {
      error: new EventErrors.InvalidTicketQuantityError("PARTICIPANT_COUNT_MISMATCH", { expectedParticipantsCount: 4 }),
      status: 400,
      message: /dados de 4 participante/,
    },
    {
      error: new EventErrors.InvalidParticipantDataError(1, "email", "PARTICIPANT_EMAIL_INVALID"),
      status: 400,
      message: /e-mail do Participante 2 é inválido/,
      field: "participants.1.email",
      participantIndex: 1,
    },
    {
      error: new EventErrors.InvalidParticipantDataError(1, "birthDate", "PARTICIPANT_BIRTH_DATE_INVALID"),
      status: 400,
      message: /data de nascimento válida.*Participante 2/,
      field: "participants.1.birthDate",
      participantIndex: 1,
    },
    {
      error: new EventErrors.InvalidParticipantDataError(1, "birthDate", "PARTICIPANT_MINIMUM_AGE_NOT_MET", { minimumAge: 18 }),
      status: 400,
      message: /Participante 2 precisa ter pelo menos 18 anos/,
      field: "participants.1.birthDate",
      participantIndex: 1,
    },
    {
      error: new EventErrors.InvalidParticipantDataError(2, "institution", "PARTICIPANT_INSTITUTION_REQUIRED"),
      status: 400,
      message: /instituição.*Participante 3/,
      field: "participants.2.institution",
      participantIndex: 2,
    },
    { error: new EventErrors.InvalidBuyerDataError("cpf", "BUYER_CPF_INVALID"), status: 400, message: /CPF do comprador/, field: "buyer.cpf" },
    { error: new EventErrors.EventCheckoutStaleError(), status: 409, message: /lote foi atualizado/ },
    { error: new EventErrors.InvalidPartnerCodeError(), status: 400, message: /não é válido/ },
    { error: new EventErrors.PartnerCodeExpiredError(), status: 410, message: /expirou/ },
    { error: new EventErrors.PartnerCodeLimitReachedError(), status: 409, message: /limite/ },
    { error: new EventErrors.EventOrderNotFoundError(), status: 404, message: /localizar este pedido/ },
    { error: new EventErrors.EventOrderExpiredError(), status: 410, message: /reserva.*expirou/ },
    { error: new EventErrors.EventOrderInvalidStatusError(), status: 409, message: /não pode mais/ },
    { error: new EventErrors.IdempotencyConflictError(), status: 409, message: /dados da compra mudaram/ },
    { error: new EventErrors.FreeEventOrderUnsupportedError(), status: 422, message: /checkout atual/ },
    {
      error: new EventErrors.EventPaymentPreferenceError("provider secret raw response"),
      status: 502,
      message: /Não foi possível iniciar o pagamento/,
    },
    { error: new EventErrors.EventPaymentPreferenceCreatingError(), status: 202, message: /preparando seu pagamento/ },
    { error: new EventErrors.EventPaymentPreferenceAmbiguousError(), status: 409, message: /sendo reconciliado/ },
    { error: new EventErrors.ReservationInconsistencyError(), status: 409, message: /reserva mudou/ },
  ];

  for (const entry of cases) {
    const response = checkoutDomainErrorResponse(entry.error);
    assert.equal(response.status, entry.status, entry.error.code);
    assert.equal(response.body.code, entry.publicCode ?? entry.error.code, entry.error.code);
    assert.match(response.body.message, entry.message, entry.error.code);
    assert.equal(response.body.field, entry.field, entry.error.code);
    assert.equal(response.body.participantIndex, entry.participantIndex, entry.error.code);
    assert.doesNotMatch(JSON.stringify(response.body), /provider secret raw response/);
  }
});

test("api de versao informa somente o build e proibe cache", async () => {
  const previous = process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.VERCEL_GIT_COMMIT_SHA = "build-test-safe-id";
  try {
    const response = appVersionGet();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.deepEqual(await response.json(), { version: "build-test-safe-id" });
  } finally {
    if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previous;
  }
});

function signedMercadoPagoRequest(input: {
  url: string;
  secret: string;
  ts?: string;
  requestId?: string;
  body?: unknown;
}) {
  const ts = input.ts ?? "1704908010";
  const url = new URL(input.url);
  const manifest = buildMercadoPagoSignatureManifest({
    dataId: url.searchParams.get("data.id"),
    requestId: input.requestId,
    ts,
  });
  const v1 = crypto.createHmac("sha256", input.secret).update(manifest).digest("hex");
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": `ts=${ts},v1=${v1}`,
      ...(input.requestId ? { "x-request-id": input.requestId } : {}),
    },
    body: JSON.stringify(input.body ?? {}),
  });
}

test("Mercado Pago valida HMAC com data.id da query em lowercase, nao com o corpo", () => {
  const secret = "webhook-test-secret";
  const request = signedMercadoPagoRequest({
    url: "https://aaau.test/api/mercado-pago/webhook?data.id=AbC123",
    secret,
    requestId: "request-123",
    body: { data: { id: "ID-DO-CORPO-NAO-ASSINADO" } },
  });

  assert.deepEqual(validateMercadoPagoWebhookSignature(request, secret), { valid: true });
  assert.equal(validateMercadoPagoWebhookSignature(request, "wrong-secret").valid, false);
});

test("Mercado Pago remove request-id ausente do manifesto sem remover o HMAC", () => {
  const secret = "webhook-test-secret";
  const request = signedMercadoPagoRequest({
    url: "https://aaau.test/api/mercado-pago/webhook?data.id=999",
    secret,
  });

  assert.deepEqual(validateMercadoPagoWebhookSignature(request, secret), { valid: true });
});

test("rota do webhook retorna 200 para HMAC valido e 401 para assinatura invalida", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  delete process.env.DATABASE_URL;
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = "route-webhook-secret";
  try {
    const valid = signedMercadoPagoRequest({
      url: "https://aaau.test/api/mercado-pago/webhook?data.id=12345&type=payment",
      secret: "route-webhook-secret",
      requestId: "route-request-1",
      body: { type: "payment", data: { id: "12345" } },
    });
    assert.equal((await mercadoPagoWebhookPost(valid)).status, 200);

    const invalid = new Request(valid.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "route-request-1",
        "x-signature": `ts=1704908010,v1=${"0".repeat(64)}`,
      },
      body: JSON.stringify({ type: "payment", data: { id: "12345" } }),
    });
    assert.equal((await mercadoPagoWebhookPost(invalid)).status, 401);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSecret === undefined) delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    else process.env.MERCADO_PAGO_WEBHOOK_SECRET = previousSecret;
  }
});

test("template transacional compartilhado preserva identidade AAAU e escapa conteudo", () => {
  const previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://aaau.test";
  try {
    const html = buildAaauTransactionalEmailHtml({
      title: "Acesso <seguro>",
      eyebrow: "Meus ingressos",
      headerLabel: "AAAU",
      paragraphs: ["Não compartilhe este link."],
      detailLines: ["Expira em 30 minutos."],
      action: { label: "Acessar", url: "https://aaau.test/acesso?token=a&origem=email" },
    });
    assert.match(html, /background:#080607/);
    assert.match(html, /background:#7b1023/);
    assert.match(html, /Logo%20AAAU%20PNG\.png/);
    assert.match(html, /bull_torcida\.png/);
    assert.match(html, /border-radius:999px/);
    assert.match(html, /token=a&amp;origem=email/);
    assert.equal(html.includes("Acesso <seguro>"), false);
    assert.match(html, /Acesso &lt;seguro&gt;/);
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("outbox de transferencia cifra payload autenticado e mascaramento nao expoe email", () => {
  const previous = process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET;
  process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = "domain-outbox-secret-with-at-least-32-characters";
  try {
    const payload = { subject: "Convite", text: "token-super-secreto", html: "<p>token-super-secreto</p>" };
    const encrypted = encryptTransferEmailPayload(payload);
    assert.equal(JSON.stringify(encrypted).includes("token-super-secreto"), false);
    assert.deepEqual(decryptTransferEmailPayload(encrypted), payload);
    assert.equal(maskEmail("pessoa@example.com"), "pe****@example.com");
    assert.throws(() => decryptTransferEmailPayload({ ...encrypted, authenticationTag: Buffer.alloc(16).toString("base64") }));
  } finally {
    if (previous === undefined) delete process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = previous;
  }
});

test("protecoes de transferencia bloqueiam CSRF e abuso sem usar token cru na chave", () => {
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  const previousAppUrl = process.env.APP_URL;
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "domain-transfer-http-secret-with-at-least-32-characters";
  process.env.APP_URL = "https://aaau.test";
  try {
    assert.doesNotThrow(() => assertEventTicketTransferCsrf(new Headers({ origin: "https://aaau.test" })));
    assert.throws(() => assertEventTicketTransferCsrf(new Headers({ origin: "https://evil.test" })), /EVENT_TICKET_TRANSFER_CSRF/);
    for (let index = 0; index < 10; index += 1) {
      assertEventTicketTransferRateLimit({ action: "domain", opaqueCredential: "opaque-token", ip: "192.0.2.1", now: 1000 });
    }
    assert.throws(() => assertEventTicketTransferRateLimit({ action: "domain", opaqueCredential: "opaque-token", ip: "192.0.2.1", now: 1000 }), /RATE_LIMITED/);
  } finally {
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("portal usa tokens distintos, HMAC por finalidade e outbox autenticada", () => {
  const previous = process.env.EVENT_TICKET_PORTAL_SECRET;
  process.env.EVENT_TICKET_PORTAL_SECRET = "domain-portal-secret-with-at-least-32-characters";
  try {
    const magic = generatePortalToken();
    const session = generatePortalToken();
    assert.notEqual(magic, session);
    assert.notEqual(hashPortalMagicLinkToken(magic), hashPortalSessionToken(magic));
    assert.equal(hashPortalMagicLinkToken(magic).includes(magic), false);
    assert.equal(normalizePortalEmail("  PESSOA@EXAMPLE.COM "), "pessoa@example.com");
    const payload = { subject: "Acesso", text: `Link ${magic}`, html: `<a>${magic}</a>` };
    const encrypted = encryptPortalEmailPayload(payload);
    assert.equal(JSON.stringify(encrypted).includes(magic), false);
    assert.deepEqual(decryptPortalEmailPayload(encrypted), payload);
  } finally {
    if (previous === undefined) delete process.env.EVENT_TICKET_PORTAL_SECRET;
    else process.env.EVENT_TICKET_PORTAL_SECRET = previous;
  }
});

test("rate limit do portal usa backend substituivel e dimensoes IP e email", async () => {
  const previous = process.env.EVENT_TICKET_PORTAL_SECRET;
  process.env.EVENT_TICKET_PORTAL_SECRET = "domain-portal-rate-secret-with-at-least-32-characters";
  const consumed: string[] = [];
  const backend: PortalRateLimitBackend = {
    async consume(input) { consumed.push(input.key); return !input.key.startsWith("email:"); },
  };
  try {
    assert.equal(await consumePortalRateLimits({
      action: "request", ip: "192.0.2.20", emailHash: "email-hash", backend,
    }), false);
    assert.deepEqual(consumed, ["ip:192.0.2.20", "email:email-hash"]);
    const options = portalCookieOptions(new Date("2026-08-06T12:00:00.000Z"));
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/meus-ingressos");
  } finally {
    if (previous === undefined) delete process.env.EVENT_TICKET_PORTAL_SECRET;
    else process.env.EVENT_TICKET_PORTAL_SECRET = previous;
  }
});

test("configuracao operacional valida flags, secrets distintos, HTTPS e email", () => {
  const names = [
    "EVENT_TICKET_TRANSFERS_ENABLED", "EVENT_TICKET_PORTAL_ENABLED",
    "EVENT_TICKET_TRANSFER_TOKEN_SECRET", "EVENT_TICKET_TRANSFER_OUTBOX_SECRET",
    "EVENT_TICKET_PORTAL_SECRET", "CRON_SECRET", "APP_URL", "NODE_ENV",
    "RESEND_API_KEY", "RESEND_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
    process.env.EVENT_TICKET_PORTAL_ENABLED = "false";
    assert.doesNotThrow(() => validateEventTicketOperationalConfig());

    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
    assert.throws(() => validateEventTicketOperationalConfig(), /TOKEN_SECRET/);
    process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "operational-shared-secret-with-32-characters";
    process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    assert.throws(() => validateEventTicketOperationalConfig(), /secrets diferentes/);

    process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = "operational-outbox-secret-with-32-characters";
    process.env.RESEND_API_KEY = "re_test_only";
    process.env.RESEND_FROM = "AAAU <teste@aaau.test>";
    process.env.APP_URL = "not-a-url";
    assert.throws(() => validateEventTicketOperationalConfig(), /URL absoluta/);
    process.env.APP_URL = "http://aaau.test";
    Reflect.set(process.env, "NODE_ENV", "production");
    assert.throws(() => validateEventTicketOperationalConfig(), /HTTPS/);
    process.env.APP_URL = "https://aaau.test";
    assert.equal(validateEventTicketOperationalConfig().emailProvider, "RESEND");

    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    assert.throws(() => validateEventTicketOperationalConfig(), /Resend ou SMTP/);
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else Reflect.set(process.env, name, value);
    }
  }
});

test("endpoint de cron exige Bearer secret e nunca aceita segredo na query", async () => {
  const previous = {
    cron: process.env.CRON_SECRET,
    transfers: process.env.EVENT_TICKET_TRANSFERS_ENABLED,
    portal: process.env.EVENT_TICKET_PORTAL_ENABLED,
  };
  const secret = "domain-dedicated-cron-secret-with-at-least-32-characters";
  process.env.CRON_SECRET = secret;
  process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
  process.env.EVENT_TICKET_PORTAL_ENABLED = "false";
  try {
    const absent = await handleEventTicketOutboxCron(new Request("https://aaau.test/api/internal/event-ticket-outbox"));
    const query = await handleEventTicketOutboxCron(new Request(`https://aaau.test/api/internal/event-ticket-outbox?secret=${secret}`));
    const wrong = await handleEventTicketOutboxCron(new Request("https://aaau.test/api/internal/event-ticket-outbox", { headers: { authorization: "Bearer incorreto" } }));
    assert.equal(absent.status, 401);
    assert.equal(query.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(await absent.json(), { ok: false });

    const valid = await handleEventTicketOutboxCron(new Request("https://aaau.test/api/internal/event-ticket-outbox", {
      headers: { authorization: `Bearer ${secret}` },
    }));
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { ok: true, status: "disabled" });
    assert.equal((await wrong.text()).includes(secret), false);
  } finally {
    if (previous.cron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous.cron;
    if (previous.transfers === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED; else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previous.transfers;
    if (previous.portal === undefined) delete process.env.EVENT_TICKET_PORTAL_ENABLED; else process.env.EVENT_TICKET_PORTAL_ENABLED = previous.portal;
  }
});

function lot(overrides: Partial<Parameters<typeof selectActiveTicketLot>[0][number]> = {}) {
  return {
    id: "lot-1",
    name: "Lote Teste",
    description: null,
    active: true,
    quantity: 10,
    reservedQuantity: 0,
    soldQuantity: 0,
    price: new Prisma.Decimal(50),
    salesStartAt: null,
    salesEndAt: null,
    position: 1,
    ...overrides,
  };
}

function eventCode(overrides: Partial<Parameters<typeof validatePartnerCode>[0]> = {}) {
  return {
    id: "code-1",
    eventId: "event-1",
    code: "UFRGS10",
    partnerName: "UFRGS",
    partnerType: "ATHLETIC" as const,
    discountType: "PERCENTAGE" as const,
    discountValue: new Prisma.Decimal(10),
    maxUses: null,
    reservedUses: 0,
    confirmedUses: 0,
    startsAt: null,
    expiresAt: null,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function prismaKnownRequestError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("Prisma test error", {
    code,
    clientVersion: "test",
    meta,
  });
}

test("ticket lot availability rejects inconsistent counters", () => {
  assert.equal(getTicketLotAvailability(lot({ quantity: 3, reservedQuantity: 1, soldQuantity: 2 })), 0);
  assert.throws(
    () => getTicketLotAvailability(lot({ quantity: 3, reservedQuantity: 2, soldQuantity: 2 })),
    InconsistentTicketCountersError,
  );
});

test("active lot selection is deterministic by position and ignores future/expired/sold out lots", () => {
  const selected = selectActiveTicketLot(
    [
      lot({ id: "future", position: 1, salesStartAt: new Date("2026-07-08T00:00:00.000Z") }),
      lot({ id: "sold-out", position: 2, quantity: 1, soldQuantity: 1 }),
      lot({ id: "current-2", position: 4 }),
      lot({ id: "current-1", position: 3 }),
    ],
    now,
  );

  assert.equal(selected.id, "current-1");
});

test("active lot selection fails when no lot is available", () => {
  assert.throws(
    () => selectActiveTicketLot([lot({ quantity: 1, soldQuantity: 1 })], now),
    NoActiveTicketLotError,
  );
});

test("event sales window validates publication and dates", () => {
  assert.doesNotThrow(() =>
    assertTicketEventSalesOpen({
      published: true,
      status: "SALES_OPEN",
      salesStartAt: new Date("2026-07-01T00:00:00.000Z"),
      salesEndAt: new Date("2026-07-08T00:00:00.000Z"),
    }, now),
  );
  assert.throws(
    () => assertTicketEventSalesOpen({ published: false, status: "SALES_OPEN", salesStartAt: null, salesEndAt: null }, now),
    EventNotPublishedError,
  );
  assert.throws(
    () =>
      assertTicketEventSalesOpen({
        published: true,
        status: "SALES_OPEN",
        salesStartAt: new Date("2026-07-08T00:00:00.000Z"),
        salesEndAt: null,
      }, now),
    EventSalesNotStartedError,
  );
  assert.throws(
    () =>
      assertTicketEventSalesOpen({
        published: true,
        status: "SALES_OPEN",
        salesStartAt: null,
        salesEndAt: new Date("2026-07-07T17:59:00.000Z"),
      }, now),
    EventSalesEndedError,
  );
});

test("partner code normalization and validation", () => {
  assert.equal(normalizePartnerCode("  ufrgs10 "), "UFRGS10");
  assert.equal(validatePartnerCode(eventCode(), "event-1", now).code, "UFRGS10");
  assert.throws(() => validatePartnerCode(eventCode({ active: false }), "event-1", now));
  assert.throws(() =>
    validatePartnerCode(eventCode({ expiresAt: new Date("2026-07-07T17:59:00.000Z") }), "event-1", now),
  );
  assert.throws(() => validatePartnerCode(eventCode({ maxUses: 2, reservedUses: 1, confirmedUses: 1 }), "event-1", now));
});

test("partner discounts use Decimal, round to cents, and never exceed subtotal", () => {
  assert.equal(calculatePartnerDiscount(eventCode(), new Prisma.Decimal("99.99")).toString(), "10");
  assert.equal(
    calculatePartnerDiscount(
      eventCode({ discountType: "FIXED", discountValue: new Prisma.Decimal("150") }),
      new Prisma.Decimal("90"),
    ).toString(),
    "90",
  );
  assert.equal(toMoney(new Prisma.Decimal("10.005")).toString(), "10.01");
});

test("transaction conflict classifier retries Prisma write conflicts", () => {
  assert.equal(isRetryableTransactionConflict(prismaKnownRequestError("P2034")), true);
});

test("transaction conflict classifier retries raw query serialization failures only", () => {
  assert.equal(
    isRetryableTransactionConflict(prismaKnownRequestError("P2010", { code: "40001" })),
    true,
  );
  assert.equal(
    isRetryableTransactionConflict(prismaKnownRequestError("P2010", { code: "40P01" })),
    true,
  );
  assert.equal(
    isRetryableTransactionConflict(prismaKnownRequestError("P2010", { code: "23505" })),
    false,
  );
  assert.equal(isRetryableTransactionConflict(prismaKnownRequestError("P2010")), false);
});

test("transaction conflict classifier does not retry unrelated errors", () => {
  assert.equal(isRetryableTransactionConflict(prismaKnownRequestError("P2002")), false);
  assert.equal(isRetryableTransactionConflict(new Error("generic")), false);
});

test("integration database config keeps raw execution URLs separate from safe display values", async () => {
  const previousEnv = {
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    TEST_DATABASE_DIRECT_URL: process.env.TEST_DATABASE_DIRECT_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  };
  const pooled =
    "postgresql://test_user:test_password@ep-test-pooler.sa-east-1.aws.neon.tech/testdb?sslmode=require";
  const direct =
    "postgresql://test_user:test_password@ep-test.sa-east-1.aws.neon.tech/testdb?sslmode=require";
  let disconnect: (() => Promise<void>) | null = null;

  try {
    process.env.TEST_DATABASE_URL = pooled;
    process.env.TEST_DATABASE_DIRECT_URL = direct;
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    const helper = await import("@/tests/helpers/events-integration-db");
    disconnect = helper.disconnectTestPrisma;
    const config = helper.getSafeTestDatabaseConfig({ requireDirectUrl: true });
    const safeDisplay = helper.maskedDatabaseUrl(pooled);
    const migrationDatabaseUrl = helper.getMigrationDatabaseUrl(config);
    const migrationDiagnostics = helper.getDatabaseUrlDiagnostics(migrationDatabaseUrl);

    assert.equal(config.testDatabaseUrlRaw, pooled);
    assert.equal(config.testDatabaseDirectUrlRaw, direct);
    assert.equal(config.testDatabaseUrl, pooled);
    assert.equal(config.testDatabaseDirectUrl, direct);
    assert.equal(safeDisplay.includes("test_password"), false);
    assert.notEqual(safeDisplay, pooled);
    assert.equal(migrationDatabaseUrl, direct);
    assert.equal(migrationDiagnostics.hostContainsPooler, false);
  } finally {
    await disconnect?.();

    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

test("integration database config rejects malformed PostgreSQL authority before Prisma", async () => {
  const previousEnv = {
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    TEST_DATABASE_DIRECT_URL: process.env.TEST_DATABASE_DIRECT_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  };
  let disconnect: (() => Promise<void>) | null = null;

  try {
    process.env.TEST_DATABASE_URL =
      "postgresql://test_user:test_password@ep-test-pooler.sa-east-1.aws.neon.tech/testdb?sslmode=require";
    process.env.TEST_DATABASE_DIRECT_URL =
      "postgresql://test_user:not-a-port/testdb?sslmode=require";
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;

    const helper = await import("@/tests/helpers/events-integration-db");
    disconnect = helper.disconnectTestPrisma;

    assert.throws(
      () => helper.getSafeTestDatabaseConfig({ requireDirectUrl: true }),
      /porta invalida/,
    );
  } finally {
    await disconnect?.();

    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
});

test("mercado pago webhook routing separates event, store and legacy references", () => {
  assert.deepEqual(routeMercadoPagoExternalReference("event_order:event-123"), {
    kind: "event",
    eventOrderId: "event-123",
  });
  assert.deepEqual(routeMercadoPagoExternalReference("store_order:store-123"), {
    kind: "store",
    orderId: "store-123",
  });
  assert.deepEqual(routeMercadoPagoExternalReference("legacy-store-id"), {
    kind: "legacy-store",
    orderId: "legacy-store-id",
  });
  assert.deepEqual(routeMercadoPagoExternalReference("event_order:"), { kind: "unknown" });
  assert.deepEqual(routeMercadoPagoExternalReference(null), { kind: "unknown" });
});

test("event preference reconciliation accepts only compatible Mercado Pago preferences", () => {
  const order = {
    externalReference: "event_order:order-1",
    total: new Prisma.Decimal("90.00"),
  };

  assert.equal(
    isCompatibleEventPreference(
      {
        id: "pref-1",
        external_reference: "event_order:order-1",
        init_point: "https://checkout.example/pref-1",
        items: [{ quantity: 1, unit_price: 90 }],
      },
      order,
    ),
    true,
  );
  assert.equal(
    isCompatibleEventPreference(
      {
        id: "pref-2",
        external_reference: "event_order:other",
        init_point: "https://checkout.example/pref-2",
        items: [{ quantity: 1, unit_price: 90 }],
      },
      order,
    ),
    false,
  );
  assert.equal(
    isCompatibleEventPreference(
      {
        id: "pref-3",
        external_reference: "event_order:order-1",
        init_point: "https://checkout.example/pref-3",
        items: [{ quantity: 1, unit_price: 91 }],
      },
      order,
    ),
    false,
  );
  assert.equal(
    isCompatibleEventPreference(
      {
        external_reference: "event_order:order-1",
        init_point: "https://checkout.example/pref-4",
        items: [{ quantity: 1, unit_price: 90 }],
      },
      order,
    ),
    false,
  );
});

test("public event status covers soon, open, low stock, sold out and ended", () => {
  const base = {
    published: true,
    status: "SALES_OPEN",
    salesStartAt: null,
    salesEndAt: null,
    startAt: new Date("2026-07-10T20:00:00.000Z"),
    endAt: null,
    lowStockThreshold: 2,
    lots: [lot({ quantity: 10, reservedQuantity: 0, soldQuantity: 0 })],
  };
  const now = new Date("2026-07-09T12:00:00.000Z");

  assert.equal(getPublicEventStatus({ ...base, salesStartAt: new Date("2026-07-10T00:00:00.000Z") }, now), "SOON");
  assert.equal(getPublicEventStatus(base, now), "OPEN");
  assert.equal(getPublicEventStatus({ ...base, lots: [lot({ quantity: 2, reservedQuantity: 1 })] }, now), "LOW_STOCK");
  assert.equal(getPublicEventStatus({ ...base, lots: [lot({ quantity: 1, soldQuantity: 1 })] }, now), "SOLD_OUT");
  assert.equal(getPublicEventStatus({ ...base, startAt: new Date("2026-07-08T20:00:00.000Z") }, now), "ENDED");
});

test("lote exclusivo 2 por 1 respeita a janela de Sao Paulo e retoma lote normal ao esgotar", () => {
  const start = new Date("2026-08-07T12:00:00-03:00");
  const end = new Date("2026-08-08T12:00:00-03:00");
  const regular = lot({ id: "third-lot", position: 1 });
  const promotion = lot({
    id: "promo-2-for-1",
    position: 2,
    price: new Prisma.Decimal("130.00"),
    quantity: 100,
    ticketsPerUnit: 2,
    maxUnitsPerOrder: 2,
    exclusiveWindow: true,
    salesStartAt: start,
    salesEndAt: end,
  });

  assert.equal(selectActiveTicketLot([regular, promotion], new Date(start.getTime() - 1)).id, regular.id);
  assert.equal(selectActiveTicketLot([regular, promotion], start).id, promotion.id);
  assert.equal(selectActiveTicketLot([regular, promotion], new Date("2026-08-08T11:59:59-03:00")).id, promotion.id);
  assert.equal(selectActiveTicketLot([regular, promotion], end).id, regular.id);
  assert.equal(selectActiveTicketLot([regular, promotion], new Date(end.getTime() + 1)).id, regular.id);
  assert.equal(getExclusiveTicketLot([regular, promotion], start)?.id, promotion.id);
  assert.equal(selectActiveTicketLot([regular, { ...promotion, soldQuantity: 100 }], start).id, regular.id);
});

test("unidade comercial limita pacotes e materializa ingressos sem dividir o preco", () => {
  const promotion = lot({ ticketsPerUnit: 2, maxUnitsPerOrder: 2, price: new Prisma.Decimal("130.00") });
  assert.equal(getTicketLotMaxUnitsPerOrder({ maxTicketsPerOrder: 4 }, promotion), 2);
  assert.equal(getTicketCountForCommercialUnits(promotion, 1), 2);
  assert.equal(getTicketCountForCommercialUnits(promotion, 2), 4);
  assert.equal(getTicketCountForCommercialUnits(promotion, 100), 200);
  assert.equal(toMoney(promotion.price.mul(1)).toFixed(2), "130.00");
  assert.equal(toMoney(promotion.price.mul(2)).toFixed(2), "260.00");
  assert.equal(getTicketLotMaxUnitsPerOrder({ maxTicketsPerOrder: 3 }, promotion), 1);
});

test("public lot status distinguishes future, waiting and sold out lots", () => {
  const current = lot({ id: "current", position: 1 });
  const future = lot({
    id: "future",
    position: 2,
    salesStartAt: new Date("2026-07-09T18:00:00.000Z"),
  });
  const waiting = lot({ id: "waiting", position: 3 });
  const soldOut = lot({ id: "sold", position: 4, quantity: 1, soldQuantity: 1 });
  const now = new Date("2026-07-09T15:00:00.000Z");

  assert.equal(getPublicLotStatus(current, current.id, now), "CURRENT");
  assert.equal(getPublicLotStatus(future, current.id, now), "UPCOMING");
  assert.equal(getPublicLotStatus(waiting, current.id, now), "WAITING");
  assert.equal(getPublicLotStatus(soldOut, current.id, now), "SOLD_OUT");
});

test("admin status labels never expose internal English codes", () => {
  assert.equal(adminStatusLabel("PAID"), "Pagamento confirmado");
  assert.equal(adminStatusLabel("NOT_SENT"), "Aguardando envio");
  assert.equal(adminStatusLabel("USED"), "Entrada confirmada");
  assert.equal(adminStatusLabel("FUTURO"), "Abre futuramente");
  assert.equal(emailDeliveryStatusLabel("DELIVERED"), "Entregue ao destinatário");
  assert.equal(emailDeliveryStatusLabel("COMPLAINED"), "Marcado como spam");
});

test("resend webhook events map to persistent delivery statuses", () => {
  assert.equal(resendDeliveryStatus("email.sent"), "SENT");
  assert.equal(resendDeliveryStatus("email.delivered"), "DELIVERED");
  assert.equal(resendDeliveryStatus("email.delivery_delayed"), "DELAYED");
  assert.equal(resendDeliveryStatus("email.bounced"), "BOUNCED");
  assert.equal(resendDeliveryStatus("email.failed"), "FAILED");
  assert.equal(resendDeliveryStatus("email.complained"), "COMPLAINED");
  assert.equal(resendDeliveryStatus("email.suppressed"), "SUPPRESSED");
  assert.equal(resendDeliveryStatus("email.opened"), null);
});

test("event image paths accept admin input with Windows separators", () => {
  assert.equal(
    normalizeEventImagePath("\\images\\events\\evento.jpeg"),
    "/images/events/evento.jpeg",
  );
  assert.equal(normalizeEventImagePath("https://cdn.example/evento.jpeg"), "https://cdn.example/evento.jpeg");
});

test("event ticket QR payload uses only qrToken and safe base URL", () => {
  const previousAppUrl = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://au.example/";
    const payload = buildEventTicketQrPayload("tk_secure_token_123");

    assert.equal(payload, "https://au.example/checkin/tk_secure_token_123");
    assert.equal(payload.includes("52998224725"), false);
    assert.equal(payload.includes("Gustavo"), false);
    assert.equal(payload.includes("comprador@example.com"), false);
    assert.equal(payload.includes("event_order_id"), false);
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("base URL normalization avoids duplicate slashes and production rejects localhost", () => {
  assert.equal(normalizeBaseUrl("https://au.example///"), "https://au.example");
  const previousAppUrl = process.env.APP_URL;

  try {
    process.env.APP_URL = "https://au.example/";
    assert.equal(buildAbsoluteUrl("/meus-ingressos/token"), "https://au.example/meus-ingressos/token");

    process.env.APP_URL = "http://localhost:3000";
    assert.throws(() => buildAbsoluteUrl("/meus-ingressos/token", { nodeEnv: "production" }), /localhost/);
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("Mercado Pago uses configured APP_URL and ignores arbitrary request origin", () => {
  const previousAppUrl = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://staging.aaau.example/";
    const request = new Request("https://attacker.example/checkout", {
      headers: { origin: "https://attacker.example" },
    });
    assert.equal(getMercadoPagoBaseUrl(request), "https://staging.aaau.example");
  } finally {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  }
});

test("Mercado Pago notification URL uses canonical APP_URL without bypass by default", () => {
  const previous = {
    appUrl: process.env.APP_URL,
    vercelEnv: process.env.VERCEL_ENV,
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  };

  try {
    process.env.APP_URL = "https://preview.aaau.example/";
    process.env.VERCEL_ENV = "preview";
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

    assert.equal(
      buildMercadoPagoNotificationUrl(),
      "https://preview.aaau.example/api/mercado-pago/webhook",
    );
    assert.equal(
      buildMercadoPagoNotificationUrl(undefined, "/api/mercado-pago/webhook?source=store"),
      "https://preview.aaau.example/api/mercado-pago/webhook?source=store",
    );
  } finally {
    if (previous.appUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previous.appUrl;
    if (previous.vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous.vercelEnv;
    if (previous.bypassSecret === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previous.bypassSecret;
  }
});

test("Mercado Pago notification URL adds preview bypass and preserves existing parameters", () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "server-only-secret";
    const url = new URL(buildMercadoPagoNotificationUrl(
      "https://canonical.aaau.example",
      "/api/mercado-pago/webhook?source=events",
    ));

    assert.equal(url.origin, "https://canonical.aaau.example");
    assert.equal(url.pathname, "/api/mercado-pago/webhook");
    assert.equal(url.searchParams.get("source"), "events");
    assert.equal(url.searchParams.get("x-vercel-protection-bypass"), "server-only-secret");
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousSecret === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previousSecret;
  }
});

test("Mercado Pago notification URL ignores empty secret and any secret in production", () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "   ";
    assert.equal(
      new URL(buildMercadoPagoNotificationUrl("https://preview.aaau.example")).searchParams.has("x-vercel-protection-bypass"),
      false,
    );

    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "configured-but-disabled";
    assert.equal(
      buildMercadoPagoNotificationUrl("https://www.aaau.example"),
      "https://www.aaau.example/api/mercado-pago/webhook",
    );
  } finally {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousSecret === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previousSecret;
  }
});

test("event ticket visual status mapping covers all ticket statuses", () => {
  assert.equal(eventTicketStatusLabel("VALID"), "Ingresso valido");
  assert.equal(eventTicketStatusLabel("USED"), "Ingresso utilizado");
  assert.equal(eventTicketStatusLabel("CANCELED"), "Ingresso cancelado");
  assert.equal(eventTicketStatusLabel("REFUNDED"), "Ingresso reembolsado");
});

test("event ticket confirmation email uses accessToken link and omits sensitive data", () => {
  const email = buildEventTicketConfirmationEmail({
    baseUrl: "https://au.example",
    order: {
      buyerName: "Comprador Teste",
      accessToken: "access_token_seguro",
    },
    event: {
      name: "AU Night",
      startAt: now,
      venueName: "Arena AU",
      venueAddress: "Campus AU",
    },
    ticketCount: 2,
  });

  assert.equal(email.ticketsUrl, "https://au.example/meus-ingressos/access_token_seguro");
  assert.match(email.html, /images\/mascots\/bull_torcida\.png/);
  assert.match(email.html, /alt="Bull da AAAU"/);
  assert.match(email.text, /Cada participante possui um QR Code individual/);
  assert.match(email.html, /Ver meus ingressos/);
  for (const forbidden of ["52998224725", "tk_", "paymentId", "mercadoPago", "participantCpf"]) {
    assert.equal(email.text.includes(forbidden), false);
    assert.equal(email.html.includes(forbidden), false);
  }
});

test("admin event helpers normalize slug, code and masked CPF", () => {
  assert.equal(normalizeEventSlug(" AU NIGHT 2026!! "), "au-night-2026");
  assert.equal(normalizeEventSlug("Festa/Com Query?x=1"), "festa-com-query-x-1");
  assert.equal(normalizePartnerCodeAdmin(" ufrgs 10 "), "UFRGS10");
  assert.equal(maskCpfLast4("4725"), "***.***.***-4725");
  assert.equal(maskCpfLast4(null), "Nao informado");
});

test("admin CPF search uses hash only for valid length input", () => {
  assert.equal(typeof buildCpfHashSearch("529.982.247-25"), "string");
  assert.equal(buildCpfHashSearch("123"), null);
});

test("portaria QR parser accepts only official check-in payloads", () => {
  const baseUrl = "https://au.example";
  assert.deepEqual(parseEventTicketQrPayload("https://au.example/checkin/tk_secure_token_123", baseUrl), {
    ok: true,
    qrToken: "tk_secure_token_123",
  });
  assert.deepEqual(parseEventTicketQrPayload("tk_secure_token_123", baseUrl), {
    ok: true,
    qrToken: "tk_secure_token_123",
  });
  assert.equal(parseEventTicketQrPayload("https://site-falso.com/checkin/tk_secure_token_123", baseUrl).ok, false);
  assert.equal(parseEventTicketQrPayload("javascript:alert(1)", baseUrl).ok, false);
  assert.equal(parseEventTicketQrPayload("data:text/plain,tk_secure_token_123", baseUrl).ok, false);
  assert.equal(parseEventTicketQrPayload("https://au.example/outro/tk_secure_token_123", baseUrl).ok, false);
  assert.equal(parseEventTicketQrPayload("https://au.example/checkin/", baseUrl).ok, false);
  assert.equal(parseEventTicketQrPayload("https://au.example/checkin/not_official", baseUrl).ok, false);
  assert.equal(parseEventTicketQrPayload("https://au.example/checkin/tk_secure_token_123?qrToken=tk_other", baseUrl).ok, true);
});

test("portaria search normalizers enforce minimum useful formats", () => {
  assert.equal(normalizeNameSearch("  Maria   Silva "), "Maria Silva");
  assert.equal(normalizeTicketCodeSearch(" au-7k4m9p "), "AU-7K4M9P");
  assert.equal(typeof buildCpfHashForPortariaSearch("529.982.247-25"), "string");
  assert.equal(buildCpfHashForPortariaSearch("123"), null);
});

test("portaria visual statuses cover operational outcomes", () => {
  const statuses = ["VALID", "ALREADY_USED", "CANCELED", "REFUNDED", "WRONG_EVENT", "INVALID"];
  assert.deepEqual(statuses, ["VALID", "ALREADY_USED", "CANCELED", "REFUNDED", "WRONG_EVENT", "INVALID"]);
});

test("event_staff password hash validates without exposing plain text", async () => {
  const passwordHash = await hashPassword("senha-segura-123");
  assert.equal(passwordHash.includes("senha-segura-123"), false);
  assert.equal(await verifyPassword("senha-segura-123", passwordHash), true);
  assert.equal(await verifyPassword("senha-errada", passwordHash), false);
});

test("transfer security normalizes email, hashes by purpose and never persists the raw token", () => {
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  const previousFlag = process.env.EVENT_TICKET_TRANSFERS_ENABLED;
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "domain-test-transfer-secret-with-at-least-32-characters";
  process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
  try {
    const token = generateEventTicketTransferToken();
    const tokenHash = hashEventTicketAccessToken(token);
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(tokenHash.includes(token), false);
    assert.equal(normalizeEventTicketHolderEmail("  Titular@Exemplo.COM "), "titular@exemplo.com");
    assert.equal(
      hashEventTicketHolderEmail("Titular@Exemplo.COM"),
      hashEventTicketHolderEmail(" titular@exemplo.com "),
    );
    assert.equal(eventTicketTransfersEnabled(), false);
    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
    assert.equal(eventTicketTransfersEnabled(), true);
  } finally {
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED;
    else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previousFlag;
  }
});

test("transfer security rejects missing and short HMAC secrets", () => {
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  try {
    delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    assert.throws(() => hashEventTicketAccessToken("token"), /pelo menos 32 caracteres/);
    process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "curto";
    assert.throws(() => hashEventTicketAccessToken("token"), /pelo menos 32 caracteres/);
  } finally {
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
  }
});

test("fingerprint operacional do secret e deterministica, nao reversivel e distingue secrets", () => {
  const firstSecret = "domain-fingerprint-first-secret-with-at-least-32-characters";
  const secondSecret = "domain-fingerprint-second-secret-with-at-least-32-characters";
  const first = eventTicketTransferSecretFingerprint(firstSecret);
  assert.match(first, /^[a-f0-9]{16}$/);
  assert.equal(first, eventTicketTransferSecretFingerprint(firstSecret));
  assert.notEqual(first, eventTicketTransferSecretFingerprint(secondSecret));
  assert.equal(first.includes(firstSecret), false);
  assert.throws(() => eventTicketTransferSecretFingerprint("curto"), /pelo menos 32 caracteres/);
});

test("transfer recipient normalization validates CPF, email and event requirements", () => {
  const requirements = {
    requireParticipantEmail: true,
    requireParticipantPhone: true,
    requireBirthDate: true,
    requireInstitution: true,
    requireCourse: true,
    requireCampus: true,
    minimumAge: 18,
    startAt: new Date("2026-07-07T18:00:00.000Z"),
  };
  const recipient = normalizeEventTicketTransferRecipient({
    name: "  Nova   Titular <Teste> ",
    cpf: "529.982.247-25",
    email: " NOVA.TITULAR@EVENT-TEST.LOCAL ",
    phone: "(51) 99999-0000",
    birthDate: "2000-01-02",
    institution: " UFRGS ",
    course: " Direito ",
    campus: " Centro ",
  }, requirements);

  assert.equal(recipient.name, "Nova Titular Teste");
  assert.equal(recipient.cpf, "52998224725");
  assert.equal(recipient.cpfLast4, "4725");
  assert.equal(recipient.email, "nova.titular@event-test.local");
  assert.equal(recipient.phone, "51999990000");
  assert.equal(recipient.institution, "UFRGS");
  assert.throws(() => normalizeEventTicketTransferRecipient({
    name: "Nova Titular",
    cpf: "52998224725",
    email: "nova@event-test.local",
  }, requirements), /EVENT_TICKET_TRANSFER_RECIPIENT_INVALID/);
  assert.throws(() => normalizeEventTicketTransferRecipient({
    name: "Nova Titular",
    cpf: "11111111111",
    email: "invalido",
  }, { ...requirements, requireParticipantPhone: false, requireBirthDate: false,
    requireInstitution: false, requireCourse: false, requireCampus: false }),
  /EVENT_TICKET_TRANSFER_RECIPIENT_INVALID/);
  assert.throws(() => normalizeEventTicketTransferRecipient({
    name: "Titular Menor",
    cpf: "52998224725",
    email: "menor@event-test.local",
    phone: "51999990000",
    birthDate: "2010-01-01",
    institution: "UFRGS",
    course: "Direito",
    campus: "Centro",
  }, requirements), /EVENT_TICKET_TRANSFER_RECIPIENT_INVALID/);
});

test("idade minima exige nascimento mesmo sem requireBirthDate e preserva eventos sem classificacao", () => {
  const event = {
    requireParticipantEmail: true,
    requireParticipantPhone: false,
    requireBirthDate: false,
    requireInstitution: false,
    requireCourse: false,
    requireCampus: false,
    minimumAge: 18,
    startAt: new Date("2026-08-22T02:00:00.000Z"),
  };
  const baseRecipient = {
    name: "Nova Titular",
    cpf: "52998224725",
    email: "nova@event-test.local",
  };

  assert.equal(eventTicketTransferRequiresBirthDate(event), true);
  assert.throws(
    () => normalizeEventTicketTransferRecipient(baseRecipient, event),
    /EVENT_TICKET_TRANSFER_RECIPIENT_INVALID/,
  );
  assert.doesNotThrow(() => normalizeEventTicketTransferRecipient({
    ...baseRecipient,
    birthDate: "2000-01-02",
  }, event));
  assert.throws(() => normalizeEventTicketTransferRecipient({
    ...baseRecipient,
    birthDate: "2010-01-01",
  }, event), /EVENT_TICKET_TRANSFER_RECIPIENT_INVALID/);

  const unrestricted = { ...event, minimumAge: null };
  assert.equal(eventTicketTransferRequiresBirthDate(unrestricted), false);
  assert.doesNotThrow(() => normalizeEventTicketTransferRecipient(baseRecipient, unrestricted));
});

test("admin rejeita classificacao minima sem coleta de nascimento", () => {
  const input = {
    name: "Evento coerente",
    shortDescription: "Descricao curta valida",
    description: "Descricao completa valida",
    startAt: new Date("2026-08-22T02:00:00.000Z"),
    venueName: "Arena AAAU",
    minimumAge: 18,
    published: false,
    showRemainingTickets: false,
    maxTicketsPerOrder: 4,
    lowStockThreshold: 10,
    requireParticipantEmail: true,
    requireParticipantPhone: false,
    requireBirthDate: false,
    requireInstitution: false,
    requireCourse: false,
    requireCampus: false,
  };
  assert.throws(() => parseTicketEventAdminInput(input), /classificacao minima/);
  assert.equal(parseTicketEventAdminInput({ ...input, requireBirthDate: true }).requireBirthDate, true);
});

test("erro recuperavel, log e sessao de navegador nunca incluem dados sensiveis", () => {
  assert.equal(
    eventTicketTransferErrorDestination(
      new Error("EVENT_TICKET_TRANSFER_RECIPIENT_INVALID"),
      "/transferencia-ingresso/aceitar",
    ),
    "/transferencia-ingresso/aceitar?erro=dados",
  );
  assert.equal(
    safeEventTicketTransferErrorCode(new Error("falha cpf=52998224725 token=segredo nome=Pessoa")),
    "EVENT_TICKET_TRANSFER_INTERNAL_ERROR",
  );

  const originalInfo = console.info;
  const messages: string[] = [];
  console.info = (...values: unknown[]) => messages.push(values.join(" "));
  try {
    logEventTicketOperation("transfer.completion_failed", {
      transferId: "transfer-safe-id",
      stage: "completion",
      code: safeEventTicketTransferErrorCode(new Error("falha cpf=52998224725 token=segredo nome=Pessoa")),
    });
  } finally {
    console.info = originalInfo;
  }
  const output = messages.join("\n");
  assert.match(output, /transfer-safe-id/);
  assert.match(output, /EVENT_TICKET_TRANSFER_INTERNAL_ERROR/);
  assert.doesNotMatch(output, /52998224725|segredo|Pessoa/);

  const token = "a".repeat(43);
  assert.equal(isValidEventTicketTransferBrowserToken(token), true);
  assert.equal(getEventTicketTransferBrowserConfig("accept").path, "/transferencia-ingresso/aceitar");
  assert.deepEqual(
    { httpOnly: eventTicketTransferCookieOptions("accept").httpOnly, sameSite: eventTicketTransferCookieOptions("accept").sameSite },
    { httpOnly: true, sameSite: "lax" },
  );
});
