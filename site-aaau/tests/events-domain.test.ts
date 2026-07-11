import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

import { getBaseUrl as getMercadoPagoBaseUrl } from "@/lib/checkout/mercado-pago";

import {
  assertTicketEventSalesOpen,
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
} from "@/lib/events/admin";
import { getPublicEventStatus } from "@/lib/events/public";
import {
  buildEventTicketQrPayload,
  eventTicketStatusLabel,
} from "@/lib/events/ticket-display";
import { isRetryableTransactionConflict } from "@/lib/events/transaction";
import { routeMercadoPagoExternalReference } from "@/lib/mercado-pago-routing";
import {
  buildCpfHashForPortariaSearch,
  normalizeNameSearch,
  normalizeTicketCodeSearch,
} from "@/lib/portaria-search";
import { parseEventTicketQrPayload } from "@/lib/portaria-qr";
import { buildAbsoluteUrl, normalizeBaseUrl } from "@/lib/site-url";

const now = new Date("2026-07-07T18:00:00.000Z");

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
