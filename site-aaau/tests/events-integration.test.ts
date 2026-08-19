import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, before, beforeEach, test } from "node:test";
import { EmailDeliveryKind, Prisma } from "@prisma/client";
import { POST as eventCheckoutPost } from "@/app/api/eventos/checkout/route";
import { createCheckout as createStoreCheckout } from "@/lib/checkout/mercado-pago";
import { GET as portalAccessGet } from "@/app/meus-ingressos/acesso/[token]/route";

import {
  authenticateAdmin,
  createAdminSessionToken,
  parseAdminSessionToken,
} from "@/lib/auth";

import { prisma } from "@/lib/db/prisma";
import { getProductBySlug } from "@/lib/data/store";
import { EmailProviderTimeoutError, sendTrackedEmail } from "@/lib/email/delivery";
import {
  EventAdminForbiddenError,
  EventAdminValidationError,
  cancelTicketEventAdmin,
  createPartnerCodeAdmin,
  createTicketEventAdmin,
  createTicketLotAdmin,
  getAdminEventCockpit,
  getAdminEventReport,
  archivedEventOrderWhere,
  getAdminEventsDashboard,
  publishTicketEventAdmin,
  resendTicketConfirmationEmailAdmin,
  unpublishTicketEventAdmin,
  updatePartnerCodeAdmin,
  updateTicketLotAdmin,
} from "@/lib/events/admin";
import { issueManualEventTicket } from "@/lib/events/manual-issuance";
import { confirmEventTicketCheckIn } from "@/lib/events/check-in";
import {
  AmbiguousEventTicketEmailError,
  EVENT_TICKET_EMAIL_SENDING_LEASE_MS,
  ensureEventTicketConfirmationEmail,
} from "@/lib/events/email";
import {
  EventPaymentPreferenceAmbiguousError,
  EventPaymentPreferenceCreatingError,
  EventCheckoutStaleError,
  EventSalesEndedError,
  EventSalesNotStartedError,
  IdempotencyConflictError,
  InsufficientTicketAvailabilityError,
  InvalidTicketQuantityError,
  LateApprovedPaymentError,
  PartnerCodeLimitReachedError,
  PaymentIdConflictError,
  TicketAlreadyUsedError,
} from "@/lib/events/errors";
import {
  createEventPaymentPreference,
  ensureEventPaymentPreference,
  processEventPayment,
} from "@/lib/events/mercado-pago";
import {
  confirmEventOrderPayment,
  createEventOrderReservation,
  expireEventOrderReservation,
} from "@/lib/events/orders";
import { reservePartnerCodeUse } from "@/lib/events/partner-codes";
import { reserveLotTickets } from "@/lib/events/reservations";
import {
  eventOrderTicketsReady,
  getEventTicketsByAccessToken,
} from "@/lib/events/ticket-access";
import {
  generateEventTicketCode,
  generateEventTicketQrToken,
  issueEventTicketsForPaidOrder,
} from "@/lib/events/tickets";
import { getUpcomingTicketSale } from "@/lib/events/public";
import {
  getTransactionRetryMetrics,
  resetTransactionRetryMetrics,
  runSerializableTransactionWithRetry,
} from "@/lib/events/transaction";
import {
  createIndividualEventTicketAccessGrant,
  createPendingEventTicketTransfer,
  ensureInitialEventTicketQrVersion,
  eventTicketTransferIsExpired,
  expirePendingEventTicketTransfers,
  findActiveEventTicketAccessGrant,
  findActiveEventTicketAccessGrantsByHolderEmail,
  findActiveEventTicketQrVersion,
  findEventTicketTransfer,
  findPendingEventTicketTransfer,
  resolveEventTicketAccessGrant,
  revokeActiveEventTicketAccessGrants,
} from "@/lib/events/transfer-foundation";
import { hashEventTicketCode, hashEventTicketQrToken } from "@/lib/events/transfer-security";
import {
  repairLegacyEventTicketCredentialHashes,
  verifyEventTicketCredentialHashes,
} from "@/lib/events/transfer-hash-repair";
import {
  completeEventTicketTransfer,
  type CompleteEventTicketTransferInput,
} from "@/lib/events/transfer-completion";
import {
  acceptEventTicketTransfer,
  cancelEventTicketTransfer,
  confirmEventTicketTransfer,
  getHolderConfirmationView,
  getRecipientAcceptanceView,
  rejectEventTicketTransfer,
  requestEventTicketTransfer,
  transferEventTicketDirectly,
} from "@/lib/events/transfer-flow";
import {
  decryptTransferEmailPayload,
  processEventTicketTransferOutbox,
} from "@/lib/events/transfer-outbox";
import { getEventTicketPortalView } from "@/lib/events/portal-access";
import { eventTicketPortalEnabled } from "@/lib/events/portal-config";
import { processEventTicketPortalOutbox } from "@/lib/events/portal-outbox";
import {
  decryptPortalEmailPayload,
  hashPortalEmail,
  hashPortalMagicLinkToken,
  hashPortalSessionToken,
} from "@/lib/events/portal-security";
import {
  exchangeEventTicketPortalMagicLink,
  requestEventTicketPortalAccess,
  resolveEventTicketPortalSession,
  revokeEventTicketPortalSession,
} from "@/lib/events/portal-session";
import { consumePortalRateLimits } from "@/lib/events/portal-rate-limit";
import { runEventTicketOutboxCycle } from "@/lib/events/outbox-operations";
import { deliverEventTicketOutboxImmediately } from "@/lib/events/immediate-outbox";
import {
  assignEventStaff,
  confirmPortariaManualTicket,
  confirmPortariaQrTicket,
  createEventStaffUser,
  getLatestPortariaEntries,
  searchPortariaTickets,
  validatePortariaManualTicket,
  validatePortariaQrTicketDto,
} from "@/lib/portaria";
import { hashPassword } from "@/lib/password";
import {
  assertSafeTestDatabase,
  cleanEventTestData,
  disconnectTestPrisma,
  testPrisma,
} from "@/tests/helpers/events-integration-db";
import {
  buyer,
  createEventWithLot,
  createTestAdminUser,
  createTestPartnerCode,
  createTestTicketEvent,
  createTestTicketLot,
  participant,
} from "@/tests/helpers/events-fixtures";

assertSafeTestDatabase();

const integrationOperationalPrevious = {
  transferTokenSecret: process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET,
  outboxSecret: process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET,
  appUrl: process.env.APP_URL,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFrom: process.env.RESEND_FROM,
  cronSecret: process.env.CRON_SECRET,
};

before(() => {
  resetTransactionRetryMetrics();
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "integration-transfer-secret-with-at-least-32-characters";
  process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = "integration-outbox-secret-with-at-least-32-characters";
  process.env.APP_URL = "https://aaau.test";
  process.env.RESEND_API_KEY = "re_test_operational_config_only";
  process.env.RESEND_FROM = "AAAU Teste <ingressos@aaau.test>";
  process.env.CRON_SECRET = "integration-cron-secret-with-at-least-32-characters";
});

beforeEach(async () => {
  await cleanEventTestData();
});

after(async () => {
  const retryMetrics = getTransactionRetryMetrics();
  console.log(`transactionConflictDetected=${retryMetrics.transactionConflictDetected}`);
  console.log(`transactionRetryExecuted=${retryMetrics.transactionRetryExecuted}`);
  console.log(`retryReason=${JSON.stringify(retryMetrics.retryReason)}`);
  await cleanEventTestData();
  await prisma.$disconnect();
  await disconnectTestPrisma();
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("EVENT_TICKET_TRANSFER_OUTBOX_SECRET", integrationOperationalPrevious.outboxSecret);
  restore("EVENT_TICKET_TRANSFER_TOKEN_SECRET", integrationOperationalPrevious.transferTokenSecret);
  restore("APP_URL", integrationOperationalPrevious.appUrl);
  restore("RESEND_API_KEY", integrationOperationalPrevious.resendApiKey);
  restore("RESEND_FROM", integrationOperationalPrevious.resendFrom);
  restore("CRON_SECRET", integrationOperationalPrevious.cronSecret);
});

function expectOneSuccessOneFailure(results: readonly PromiseSettledResult<unknown>[]) {
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
}

async function assertLotInvariant(lotId: string) {
  const lot = await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lotId } });
  assert.ok(lot.reservedQuantity >= 0);
  assert.ok(lot.soldQuantity >= 0);
  assert.ok(lot.reservedQuantity + lot.soldQuantity <= lot.quantity);
  return lot;
}

async function assertPartnerInvariant(codeId: string) {
  const code = await testPrisma.eventPartnerCode.findUniqueOrThrow({ where: { id: codeId } });
  assert.ok(code.reservedUses >= 0);
  assert.ok(code.confirmedUses >= 0);
  if (code.maxUses !== null) {
    assert.ok(code.reservedUses + code.confirmedUses <= code.maxUses);
  }
  return code;
}

async function reserveOrder(input: {
  eventId: string;
  idempotencyKey: string;
  quantity?: number;
  buyerIndex?: number;
  participantOffset?: number;
  partnerCode?: string;
  ticketLotId?: string;
  commercialUnitQuantity?: number;
  participantCount?: number;
  now?: Date;
}) {
  const quantity = input.quantity ?? 1;
  const participantCount = input.participantCount ?? quantity;
  const participantOffset = input.participantOffset ?? 0;

  return createEventOrderReservation({
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    buyer: buyer(input.buyerIndex ?? 0),
    partnerCode: input.partnerCode,
    ticketLotId: input.ticketLotId,
    commercialUnitQuantity: input.commercialUnitQuantity,
    now: input.now,
    participants: Array.from({ length: participantCount }, (_, index) =>
      participant(index + participantOffset),
    ),
  });
}

async function createPaidOrderFixture(quantity = 1) {
  const { event, lot } = await createEventWithLot(quantity);
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: `paid-${event.id}`,
    quantity,
  });
  await confirmEventOrderPayment({
    eventOrderId: order.orderId,
    paymentId: `PAY-${event.id}`,
    paidAmount: order.total,
  });
  return { event, lot, order };
}

const PROMO_START = new Date("2026-08-07T12:00:00-03:00");
const PROMO_END = new Date("2026-08-08T12:00:00-03:00");
const PROMO_NOW = new Date("2026-08-07T18:00:00-03:00");

async function createPromotionalEvent(overrides: { quantity?: number; soldQuantity?: number } = {}) {
  const event = await createTestTicketEvent({
    maxTicketsPerOrder: 4,
    salesStartAt: new Date("2026-08-01T00:00:00-03:00"),
    salesEndAt: new Date("2026-08-10T00:00:00-03:00"),
    startAt: new Date("2026-08-15T20:00:00-03:00"),
  });
  const regular = await createTestTicketLot(event.id, {
    name: "Terceiro lote",
    position: 1,
    price: new Prisma.Decimal("150.00"),
    quantity: 300,
    salesStartAt: new Date("2026-08-01T00:00:00-03:00"),
    salesEndAt: new Date("2026-08-10T00:00:00-03:00"),
  });
  const promotion = await createTestTicketLot(event.id, {
    name: "Lote Promocional - 2 por 1",
    position: 2,
    price: new Prisma.Decimal("130.00"),
    quantity: overrides.quantity ?? 100,
    soldQuantity: overrides.soldQuantity ?? 0,
    ticketsPerUnit: 2,
    maxUnitsPerOrder: 2,
    exclusiveWindow: true,
    salesStartAt: PROMO_START,
    salesEndAt: PROMO_END,
  });
  return { event, regular, promotion };
}

const transferRecipient = {
  name: "Nova Titular",
  cpf: "52998224725",
  email: "nova.titular@event-test.local",
  phone: "51999990000",
};

async function createReadyTransfer(
  ticketId: string,
  recipient: CompleteEventTicketTransferInput["recipient"] = transferRecipient,
) {
  const transfer = await createPendingEventTicketTransfer({
    ticketId,
    toHolderName: recipient.name.trim(),
    toHolderEmail: recipient.email,
    expiresAt: new Date(Date.now() + 60_000),
    db: testPrisma,
  });
  const now = new Date();
  return testPrisma.eventTicketTransfer.update({
    where: { id: transfer.id },
    data: {
      status: "PENDING_RECIPIENT_ACCEPTANCE",
      currentHolderConfirmedAt: now,
      recipientConfirmedAt: now,
    },
  });
}

function enableTransferTestEnvironment() {
  const previousFlag = process.env.EVENT_TICKET_TRANSFERS_ENABLED;
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  const previousOutboxSecret = process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET;
  const previousAppUrl = process.env.APP_URL;
  const previousResendApiKey = process.env.RESEND_API_KEY;
  const previousResendFrom = process.env.RESEND_FROM;
  const previousCronSecret = process.env.CRON_SECRET;
  process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "integration-transfer-secret-with-at-least-32-characters";
  process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = "integration-outbox-secret-with-at-least-32-characters";
  process.env.APP_URL = "https://aaau.test";
  process.env.RESEND_API_KEY = "re_test_operational_config_only";
  process.env.RESEND_FROM = "AAAU Teste <ingressos@aaau.test>";
  process.env.CRON_SECRET = "integration-cron-secret-with-at-least-32-characters";
  return () => {
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED;
    else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
    if (previousOutboxSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET = previousOutboxSecret;
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
    if (previousResendApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendApiKey;
    if (previousResendFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = previousResendFrom;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  };
}

function enablePortalTestEnvironment() {
  const restoreTransfer = enableTransferTestEnvironment();
  const previousFlag = process.env.EVENT_TICKET_PORTAL_ENABLED;
  const previousSecret = process.env.EVENT_TICKET_PORTAL_SECRET;
  process.env.EVENT_TICKET_PORTAL_ENABLED = "true";
  process.env.EVENT_TICKET_PORTAL_SECRET = "integration-portal-secret-with-at-least-32-characters";
  return () => {
    restoreTransfer();
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_PORTAL_ENABLED;
    else process.env.EVENT_TICKET_PORTAL_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_PORTAL_SECRET;
    else process.env.EVENT_TICKET_PORTAL_SECRET = previousSecret;
  };
}

async function createPortalSessionFor(email: string, ip: string) {
  const access = await requestEventTicketPortalAccess({ email, ip });
  assert.ok(access.rawMagicToken);
  const exchanged = await exchangeEventTicketPortalMagicLink({ rawMagicToken: access.rawMagicToken, ip });
  assert.ok(exchanged);
  const session = await resolveEventTicketPortalSession(exchanged.rawSessionToken);
  assert.ok(session);
  return session;
}

function approvedPayment(input: {
  id: string;
  externalReference: string;
  amount: Prisma.Decimal | string | number;
  preferenceId?: string;
}) {
  return {
    id: input.id,
    status: "approved",
    status_detail: "accredited",
    external_reference: input.externalReference,
    transaction_amount: Number(input.amount.toString()),
    payment_method_id: "pix",
    payment_type_id: "bank_transfer",
    date_approved: new Date().toISOString(),
    preference_id: input.preferenceId ?? `pref-${input.id}`,
  };
}

async function createReservedOrderFixture(input: {
  quantity?: number;
  partnerCode?: string;
  idempotencyKey?: string;
}) {
  const { event, lot } = await createEventWithLot(10);
  const code = input.partnerCode
    ? await createTestPartnerCode(event.id, { code: input.partnerCode, maxUses: 5 })
    : null;
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: input.idempotencyKey ?? `payment-${event.id}`,
    quantity: input.quantity ?? 1,
    partnerCode: input.partnerCode,
  });

  return { event, lot, code, order };
}

function installPreferenceFetchMock(options: {
  createResponse?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  searchResponse?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
}) {
  const previousFetch = global.fetch;
  const previousAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const calls = {
    create: 0,
    search: 0,
  };

  process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-event-token";
  global.fetch = (async (input, init) => {
    const url = String(input);

    if (url.includes("/checkout/preferences/search")) {
      calls.search += 1;
      return Response.json(options.searchResponse ? await options.searchResponse() : { results: [] });
    }

    if (url.includes("/checkout/preferences")) {
      calls.create += 1;
      return Response.json(
        options.createResponse
          ? await options.createResponse()
          : {
              id: `pref-${calls.create}`,
              init_point: `https://www.mercadopago.com/init-${calls.create}`,
              sandbox_init_point: `https://sandbox.mercadopago.com/init-${calls.create}`,
            },
      );
    }

    throw new Error(`Unexpected fetch call: ${url} ${init?.method ?? "GET"}`);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      global.fetch = previousFetch;
      if (previousAccessToken === undefined) {
        delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
      } else {
        process.env.MERCADO_PAGO_ACCESS_TOKEN = previousAccessToken;
      }
    },
  };
}

function compatiblePreference(order: { externalReference: string; total: Prisma.Decimal | string | number }, id: string) {
  return {
    id,
    external_reference: order.externalReference,
    init_point: `https://www.mercadopago.com/${id}`,
    sandbox_init_point: `https://sandbox.mercadopago.com/${id}`,
    items: [{ quantity: 1, unit_price: Number(order.total.toString()) }],
  };
}

const superAdminActor = { role: "super_admin" as const, email: "super-admin@event-test.local", adminUserId: null };
const eventStaffActor = { role: "event_staff" as const, adminUserId: null };

function adminEventInput(overrides: Partial<Parameters<typeof createTicketEventAdmin>[0]> = {}) {
  return {
    name: `Evento Admin ${Date.now()}`,
    slug: "",
    shortDescription: "Evento admin teste",
    description: "Evento admin de teste para gestao",
    bannerImage: null,
    coverImage: null,
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endAt: null,
    salesStartAt: new Date(Date.now() + 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    venueName: "Arena Admin",
    venueAddress: "Campus Admin",
    minimumAge: 18,
    published: false,
    showRemainingTickets: true,
    maxTicketsPerOrder: 4,
    lowStockThreshold: 5,
    requireParticipantEmail: false,
    requireParticipantPhone: false,
    requireBirthDate: true,
    requireInstitution: false,
    requireCourse: false,
    requireCampus: false,
    ...overrides,
  };
}

function adminLotInput(overrides: Partial<Parameters<typeof createTicketLotAdmin>[1]> = {}) {
  return {
    name: "Lote Admin",
    description: "Lote de teste",
    price: new Prisma.Decimal("50.00"),
    quantity: 10,
    salesStartAt: new Date(Date.now() + 60 * 60 * 1000),
    salesEndAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    position: 1,
    active: true,
    autoActivate: true,
    ...overrides,
  };
}

test("concorrencia do ultimo ingresso cria exatamente uma reserva", async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await cleanEventTestData();
    const { event, lot } = await createEventWithLot(1);
    const results = await Promise.allSettled([
      reserveOrder({ eventId: event.id, idempotencyKey: `last-a-${attempt}`, participantOffset: 0 }),
      reserveOrder({ eventId: event.id, idempotencyKey: `last-b-${attempt}`, participantOffset: 1 }),
    ]);

    expectOneSuccessOneFailure(results);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof InsufficientTicketAvailabilityError);

    const updatedLot = await assertLotInvariant(lot.id);
    assert.equal(updatedLot.reservedQuantity, 1);
    assert.equal(updatedLot.soldQuantity, 0);
    assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id, status: "PENDING" } }), 1);
  }
});

test("concorrencia com quantidade parcial nao excede capacidade", async () => {
  const { event, lot } = await createEventWithLot(3);
  const results = await Promise.allSettled([
    reserveOrder({ eventId: event.id, idempotencyKey: "partial-a", quantity: 2, participantOffset: 0 }),
    reserveOrder({ eventId: event.id, idempotencyKey: "partial-b", quantity: 2, participantOffset: 2 }),
  ]);

  expectOneSuccessOneFailure(results);
  const updatedLot = await assertLotInvariant(lot.id);
  assert.equal(updatedLot.reservedQuantity, 2);
});

test("concorrencia no ultimo uso de partner code faz rollback da reserva perdedora", async () => {
  const { event, lot } = await createEventWithLot(10);
  const code = await createTestPartnerCode(event.id, { code: "LIMIT1", maxUses: 1 });
  const results = await Promise.allSettled([
    reserveOrder({ eventId: event.id, idempotencyKey: "partner-a", participantOffset: 0, partnerCode: "limit1" }),
    reserveOrder({ eventId: event.id, idempotencyKey: "partner-b", participantOffset: 1, partnerCode: "LIMIT1" }),
  ]);

  expectOneSuccessOneFailure(results);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof PartnerCodeLimitReachedError);

  const updatedLot = await assertLotInvariant(lot.id);
  const updatedCode = await assertPartnerInvariant(code.id);
  assert.equal(updatedLot.reservedQuantity, 1);
  assert.equal(updatedCode.reservedUses, 1);
  assert.equal(updatedCode.confirmedUses, 0);
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 1);
});

test("rollback transacional desfaz lote quando partner code falha dentro da transacao", async () => {
  const { lot, event } = await createEventWithLot(5);
  const code = await createTestPartnerCode(event.id, {
    code: "FULL",
    maxUses: 1,
    confirmedUses: 1,
  });

  await assert.rejects(
    () =>
      runSerializableTransactionWithRetry(async (tx) => {
        await reserveLotTickets(tx, lot.id, 1);
        await reservePartnerCodeUse(tx, code.id);
      }),
    PartnerCodeLimitReachedError,
  );

  const updatedLot = await assertLotInvariant(lot.id);
  const updatedCode = await assertPartnerInvariant(code.id);
  assert.equal(updatedLot.reservedQuantity, 0);
  assert.equal(updatedCode.reservedUses, 0);
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
});

test("idempotencia concorrente com mesmo payload cria um unico pedido", async () => {
  const { event, lot } = await createEventWithLot(10);
  const code = await createTestPartnerCode(event.id, { code: "IDEM", maxUses: 5 });
  const payload = {
    eventId: event.id,
    idempotencyKey: "same-key",
    quantity: 2,
    participantOffset: 0,
    partnerCode: "IDEM",
  };
  const results = await Promise.allSettled([reserveOrder(payload), reserveOrder(payload)]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  const orderIds = new Set(
    results.map((result) => (result.status === "fulfilled" ? result.value.orderId : "")),
  );
  assert.equal(orderIds.size, 1);
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 1);
  assert.equal(await testPrisma.eventOrderParticipant.count(), 2);
  assert.equal((await assertLotInvariant(lot.id)).reservedQuantity, 2);
  assert.equal((await assertPartnerInvariant(code.id)).reservedUses, 1);
});

test("idempotencyKey com payload diferente gera conflito sem nova reserva", async () => {
  const { event, lot } = await createEventWithLot(10);
  await reserveOrder({ eventId: event.id, idempotencyKey: "conflict-key", quantity: 1 });

  await assert.rejects(
    () =>
      reserveOrder({
        eventId: event.id,
        idempotencyKey: "conflict-key",
        quantity: 2,
        participantOffset: 1,
      }),
    IdempotencyConflictError,
  );

  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 1);
  assert.equal(await testPrisma.eventOrderParticipant.count(), 1);
  assert.equal((await assertLotInvariant(lot.id)).reservedQuantity, 1);
});

test("expiracao concorrente e idempotente libera lote e partner code uma vez", async () => {
  const { event, lot } = await createEventWithLot(10);
  const code = await createTestPartnerCode(event.id, { code: "EXP", maxUses: 2 });
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "expire-key",
    quantity: 2,
    partnerCode: "EXP",
  });
  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  const results = await Promise.allSettled([
    expireEventOrderReservation(order.orderId),
    expireEventOrderReservation(order.orderId),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).status, "EXPIRED");
  assert.equal((await assertLotInvariant(lot.id)).reservedQuantity, 0);
  assert.equal((await assertPartnerInvariant(code.id)).reservedUses, 0);
});

test("confirmacao de pagamento duplicada concorrente confirma contadores e tickets uma vez", async () => {
  const { event, lot } = await createEventWithLot(10);
  const code = await createTestPartnerCode(event.id, { code: "PAYOK", maxUses: 2 });
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "pay-key",
    quantity: 2,
    partnerCode: "PAYOK",
  });
  const results = await Promise.allSettled([
    confirmEventOrderPayment({ eventOrderId: order.orderId, paymentId: "PAYMENT_DUP", paidAmount: order.total }),
    confirmEventOrderPayment({ eventOrderId: order.orderId, paymentId: "PAYMENT_DUP", paidAmount: order.total }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).status, "PAID");
  const updatedLot = await assertLotInvariant(lot.id);
  const updatedCode = await assertPartnerInvariant(code.id);
  assert.equal(updatedLot.reservedQuantity, 0);
  assert.equal(updatedLot.soldQuantity, 2);
  assert.equal(updatedCode.reservedUses, 0);
  assert.equal(updatedCode.confirmedUses, 1);
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: order.orderId } }), 2);
  assert.equal(await testPrisma.eventTicketQrVersion.count({
    where: { ticket: { eventOrderId: order.orderId }, version: 1, status: "ACTIVE" },
  }), 2);
});

test("promocao 2 por 1 cobra por pacote, emite ingressos individuais e reporta unidades separadamente", async () => {
  const { event, promotion } = await createPromotionalEvent();
  const first = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "promo-one-package",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 1,
    participantCount: 2,
    now: PROMO_NOW,
  });
  assert.equal(first.total.toFixed(2), "130.00");

  const persistedFirst = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: first.orderId } });
  assert.equal(persistedFirst.ticketLotId, promotion.id);
  assert.equal(persistedFirst.commercialUnitQuantity, 1);
  assert.equal(persistedFirst.ticketsPerUnit, 2);
  assert.equal(persistedFirst.commercialUnitPrice.toFixed(2), "130.00");

  const previousFetch = global.fetch;
  const previousAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const payloads: Array<Record<string, unknown>> = [];
  try {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-promo-token";
    global.fetch = (async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return Response.json({
        id: "pref-promo-one",
        init_point: "https://www.mercadopago.com/promo",
        sandbox_init_point: "https://sandbox.mercadopago.com/promo",
      });
    }) as typeof fetch;
    await createEventPaymentPreference({ eventOrderId: first.orderId, baseUrl: "https://aaau.test", now: PROMO_NOW });
  } finally {
    global.fetch = previousFetch;
    if (previousAccessToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    else process.env.MERCADO_PAGO_ACCESS_TOKEN = previousAccessToken;
  }
  const mercadoPagoPayload = payloads[0] as {
    items?: Array<{ id?: string; quantity?: number; unit_price?: number; title?: string }>;
    metadata?: Record<string, unknown>;
  };
  assert.deepEqual(mercadoPagoPayload.items?.[0], {
    id: promotion.id,
    title: "Lote Promocional - 2 por 1",
    description: "1 unidade(s), 2 ingresso(s)",
    currency_id: "BRL",
    quantity: 1,
    unit_price: 130,
  });
  assert.equal(mercadoPagoPayload.metadata?.commercial_unit_quantity, 1);
  assert.equal(mercadoPagoPayload.metadata?.tickets_per_unit, 2);
  assert.equal(mercadoPagoPayload.metadata?.ticket_count, 2);

  await confirmEventOrderPayment({
    eventOrderId: first.orderId,
    paymentId: "PAY-PROMO-ONE",
    paidAmount: first.total,
    now: PROMO_NOW,
  });
  const repeatedConfirmation = await confirmEventOrderPayment({
    eventOrderId: first.orderId,
    paymentId: "PAY-PROMO-ONE",
    paidAmount: first.total,
    now: PROMO_NOW,
  });
  assert.equal(repeatedConfirmation.alreadyProcessed, true);
  const firstTickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: first.orderId } });
  assert.equal(firstTickets.length, 2);
  assert.equal(new Set(firstTickets.map((ticket) => ticket.qrToken)).size, 2);
  assert.equal(new Set(firstTickets.map((ticket) => ticket.ticketCode)).size, 2);
  assert.equal(await testPrisma.eventTicketQrVersion.count({
    where: { ticket: { eventOrderId: first.orderId }, version: 1, status: "ACTIVE" },
  }), 2);

  const second = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "promo-two-packages",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 2,
    participantCount: 4,
    participantOffset: 1,
    buyerIndex: 1,
    now: PROMO_NOW,
  });
  assert.equal(second.total.toFixed(2), "260.00");
  await confirmEventOrderPayment({
    eventOrderId: second.orderId,
    paymentId: "PAY-PROMO-TWO",
    paidAmount: second.total,
    now: PROMO_NOW,
  });
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: second.orderId } }), 4);
  assert.equal(await testPrisma.eventTicketQrVersion.count({
    where: { ticket: { eventOrderId: second.orderId }, version: 1, status: "ACTIVE" },
  }), 4);

  const sentMessages: Array<{ text?: string; html?: string }> = [];
  await ensureEventTicketConfirmationEmail(second.orderId, {
    baseUrl: "https://aaau.test",
    from: "AAAU <ingressos@aaau.test>",
    sender: { async sendMail(message) { sentMessages.push(message); } },
  });
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].text ?? "", /Quantidade de ingressos: 4/);
  assert.match(sentMessages[0].html ?? "", /Quantidade:<\/strong> 4 ingressos/);

  const updatedLot = await assertLotInvariant(promotion.id);
  assert.equal(updatedLot.soldQuantity, 3);
  assert.equal(updatedLot.reservedQuantity, 0);
  const report = await getAdminEventReport(event.id);
  const promoReport = report?.lots.find((lot) => lot.id === promotion.id);
  assert.equal(promoReport?.paidCommercialUnits, 3);
  assert.equal(promoReport?.paidTickets, 6);
  assert.equal(promoReport?.revenue.toFixed(2), "390.00");
});

test("promocao rejeita pacote parcial, terceiro pacote, lote suspenso e janela adulterada", async () => {
  const { event, regular, promotion } = await createPromotionalEvent();
  await assert.rejects(() => reserveOrder({
    eventId: event.id,
    idempotencyKey: "promo-partial",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 1,
    participantCount: 1,
    now: PROMO_NOW,
  }), InvalidTicketQuantityError);
  await assert.rejects(() => createEventOrderReservation({
    eventId: event.id,
    idempotencyKey: "promo-stale-client",
    buyer: buyer(0),
    participants: [participant(0)],
    now: PROMO_NOW,
  }), EventCheckoutStaleError);
  await assert.rejects(() => reserveOrder({
    eventId: event.id,
    idempotencyKey: "promo-three-packages",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 3,
    participantCount: 6,
    now: PROMO_NOW,
  }), InvalidTicketQuantityError);
  await assert.rejects(() => reserveOrder({
    eventId: event.id,
    idempotencyKey: "regular-during-promo",
    ticketLotId: regular.id,
    commercialUnitQuantity: 1,
    participantCount: 1,
    now: PROMO_NOW,
  }), EventCheckoutStaleError);
  await assert.rejects(() => createEventOrderReservation({
    eventId: event.id,
    idempotencyKey: "promo-before-window",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 1,
    buyer: buyer(0),
    participants: [participant(0), participant(1)],
    now: new Date(PROMO_START.getTime() - 1),
  }), EventCheckoutStaleError);
  await assert.rejects(() => createEventOrderReservation({
    eventId: event.id,
    idempotencyKey: "promo-at-end",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 1,
    buyer: buyer(0),
    participants: [participant(0), participant(1)],
    now: PROMO_END,
  }), EventCheckoutStaleError);
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
});

test("checkout HTTP identifica cliente anterior ao 2 por 1 sem criar reserva", async () => {
  const event = await createTestTicketEvent({ maxTicketsPerOrder: 4 });
  const lot = await createTestTicketLot(event.id, {
    name: "Promocional ativo",
    ticketsPerUnit: 2,
    maxUnitsPerOrder: 2,
    exclusiveWindow: true,
  });
  const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.199" },
    body: JSON.stringify({
      eventSlug: event.slug,
      buyer: buyer(),
      participants: [participant()],
      idempotencyKey: "stale-promo-http-client-key",
    }),
  }));

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "EVENT_CHECKOUT_STALE");
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
  assert.equal((await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } })).reservedQuantity, 0);
});

test("estoque promocional residual e concorrente nunca ultrapassa 100 pacotes", async () => {
  const { event, promotion } = await createPromotionalEvent({ soldQuantity: 99 });
  await assert.rejects(() => createEventOrderReservation({
    eventId: event.id,
    idempotencyKey: "promo-residual-two",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 2,
    buyer: buyer(0),
    participants: [participant(0), participant(1), participant(2), participant(3)],
    now: PROMO_NOW,
  }), InsufficientTicketAvailabilityError);

  const results = await Promise.allSettled([
    createEventOrderReservation({
      eventId: event.id,
      idempotencyKey: "promo-final-a",
      ticketLotId: promotion.id,
      commercialUnitQuantity: 1,
      buyer: buyer(0),
      participants: [participant(0), participant(1)],
      now: PROMO_NOW,
    }),
    createEventOrderReservation({
      eventId: event.id,
      idempotencyKey: "promo-final-b",
      ticketLotId: promotion.id,
      commercialUnitQuantity: 1,
      buyer: buyer(1),
      participants: [participant(2), participant(3)],
      now: PROMO_NOW,
    }),
  ]);
  expectOneSuccessOneFailure(results);
  const updated = await assertLotInvariant(promotion.id);
  assert.equal(updated.soldQuantity, 99);
  assert.equal(updated.reservedQuantity, 1);
  assert.equal(updated.soldQuantity + updated.reservedQuantity, 100);
});

test("paymentId duplicado nao confirma segundo pedido nem altera contadores", async () => {
  const { event, lot } = await createEventWithLot(10);
  const first = await reserveOrder({ eventId: event.id, idempotencyKey: "payment-first", participantOffset: 0 });
  const second = await reserveOrder({ eventId: event.id, idempotencyKey: "payment-second", participantOffset: 1 });

  await confirmEventOrderPayment({
    eventOrderId: first.orderId,
    paymentId: "PAYMENT_TEST_001",
    paidAmount: first.total,
  });

  await assert.rejects(
    () =>
      confirmEventOrderPayment({
        eventOrderId: second.orderId,
        paymentId: "PAYMENT_TEST_001",
        paidAmount: second.total,
      }),
    PaymentIdConflictError,
  );

  assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: second.orderId } })).status, "PENDING");
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: second.orderId } }), 0);
  const updatedLot = await assertLotInvariant(lot.id);
  assert.equal(updatedLot.reservedQuantity, 1);
  assert.equal(updatedLot.soldQuantity, 1);
});

test("late approved payment apos expiracao nao emite ticket nem vende lote", async () => {
  const { event, lot } = await createEventWithLot(2);
  const order = await reserveOrder({ eventId: event.id, idempotencyKey: "late-key" });
  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  await expireEventOrderReservation(order.orderId);

  await assert.rejects(
    () =>
      confirmEventOrderPayment({
        eventOrderId: order.orderId,
        paymentId: "PAYMENT_LATE",
        paidAmount: order.total,
      }),
    LateApprovedPaymentError,
  );

  assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).status, "EXPIRED");
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: order.orderId } }), 0);
  const updatedLot = await assertLotInvariant(lot.id);
  assert.equal(updatedLot.reservedQuantity, 0);
  assert.equal(updatedLot.soldQuantity, 0);
});

test("processamento de pagamento approved confirma pedido de evento e e idempotente", async () => {
  const { lot, code, order } = await createReservedOrderFixture({
    quantity: 2,
    partnerCode: "EVPAY",
    idempotencyKey: "event-payment-approved",
  });
  const payment = approvedPayment({
    id: "EVT_PAY_APPROVED",
    externalReference: order.externalReference,
    amount: order.total,
  });

  assert.equal((await processEventPayment(payment)).result, "CONFIRMED");
  assert.equal((await processEventPayment(payment)).result, "ALREADY_PROCESSED");

  const updatedOrder = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
  const updatedLot = await assertLotInvariant(lot.id);
  const updatedCode = await assertPartnerInvariant(code!.id);
  assert.equal(updatedOrder.status, "PAID");
  assert.equal(updatedLot.reservedQuantity, 0);
  assert.equal(updatedLot.soldQuantity, 2);
  assert.equal(updatedCode.reservedUses, 0);
  assert.equal(updatedCode.confirmedUses, 1);
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: order.orderId } }), 2);
});

test("processamento de pagamento com amount mismatch nao confirma evento", async () => {
  const { lot, order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-mismatch",
  });
  const result = await processEventPayment(
    approvedPayment({
      id: "EVT_PAY_MISMATCH",
      externalReference: order.externalReference,
      amount: "1.00",
    }),
  );

  assert.equal(result.result, "AMOUNT_MISMATCH");
  assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).status, "PENDING");
  assert.equal((await assertLotInvariant(lot.id)).reservedQuantity, 1);
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: order.orderId } }), 0);
});

test("processamento de pagamento late approved registra ocorrencia permanente", async () => {
  const { lot, order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-late",
  });
  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  await expireEventOrderReservation(order.orderId);

  const result = await processEventPayment(
    approvedPayment({
      id: "EVT_PAY_LATE",
      externalReference: order.externalReference,
      amount: order.total,
    }),
  );

  assert.equal(result.result, "LATE_APPROVED");
  assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).status, "EXPIRED");
  assert.equal((await assertLotInvariant(lot.id)).soldQuantity, 0);
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: order.orderId } }), 0);
  assert.equal(
    await testPrisma.paymentEvent.count({
      where: { eventOrderId: order.orderId, status: "approved" },
    }),
    1,
  );
});

test("processamento de paymentId duplicado em outro EventOrder nao confirma segundo pedido", async () => {
  const first = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-first",
  });
  const second = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-second",
  });
  await processEventPayment(
    approvedPayment({
      id: "EVT_PAY_DUPLICATE",
      externalReference: first.order.externalReference,
      amount: first.order.total,
    }),
  );

  const result = await processEventPayment(
    approvedPayment({
      id: "EVT_PAY_DUPLICATE",
      externalReference: second.order.externalReference,
      amount: second.order.total,
    }),
  );

  assert.equal(result.result, "PAYMENT_ID_CONFLICT");
  assert.equal(
    (await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: second.order.orderId } })).status,
    "PENDING",
  );
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: second.order.orderId } }), 0);
});

test("processamento de status nao aprovado nao confirma evento", async () => {
  for (const [index, status] of ["pending", "rejected"].entries()) {
    const { lot, order } = await createReservedOrderFixture({
      quantity: 1,
      idempotencyKey: `event-payment-${status}`,
    });
    const result = await processEventPayment({
      ...approvedPayment({
        id: `EVT_PAY_${status.toUpperCase()}`,
        externalReference: order.externalReference,
        amount: order.total,
      }),
      status,
      date_approved: undefined,
    });

    assert.equal(result.result, "IGNORED_STATUS");
    assert.equal((await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).status, "PENDING");
    assert.equal((await assertLotInvariant(lot.id)).reservedQuantity, 1);
    assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: order.orderId } }), 0);
    assert.equal(index >= 0, true);
  }
});

test("criacao de preferencia de evento usa total e externalReference persistidos", async () => {
  const previousFetch = global.fetch;
  const previousAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const { order } = await createReservedOrderFixture({
    quantity: 2,
    idempotencyKey: "event-preference-create",
  });
  const persistedOrder = await testPrisma.eventOrder.findUniqueOrThrow({
    where: { id: order.orderId },
    include: { event: true },
  });
  const capturedPayloads: Array<{
    external_reference?: unknown;
    expiration_date_to?: unknown;
    notification_url?: unknown;
    items?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  }> = [];
  let calls = 0;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  try {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-event-token";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET = "integration-server-only-secret";
    global.fetch = (async (_url, init) => {
      calls += 1;
      capturedPayloads.push(JSON.parse(String(init?.body)));
      return Response.json({
        id: "pref-event-test",
        init_point: "https://www.mercadopago.com/init",
        sandbox_init_point: "https://sandbox.mercadopago.com/init",
      });
    }) as typeof fetch;

    const preference = await createEventPaymentPreference({
      eventOrderId: order.orderId,
      baseUrl: "https://aaau.test",
      now: new Date(Date.now() - 1_000),
    });
    const repeated = await createEventPaymentPreference({
      eventOrderId: order.orderId,
      baseUrl: "https://aaau.test",
    });
    const capturedPayload = capturedPayloads[0];
    assert.ok(capturedPayload);
    const item = capturedPayload.items?.[0] ?? {};

    assert.equal(preference.preferenceId, "pref-event-test");
    assert.equal(repeated.preferenceId, "pref-event-test");
    assert.equal(calls, 1);
    assert.equal(capturedPayload?.external_reference, persistedOrder.externalReference);
    const notificationUrl = new URL(String(capturedPayload.notification_url));
    assert.equal(notificationUrl.origin, "https://aaau.test");
    assert.equal(notificationUrl.pathname, "/api/mercado-pago/webhook");
    assert.equal(
      notificationUrl.searchParams.get("x-vercel-protection-bypass"),
      "integration-server-only-secret",
    );
    assert.equal(JSON.stringify(preference).includes("integration-server-only-secret"), false);
    assert.equal(JSON.stringify(await testPrisma.eventOrder.findUniqueOrThrow({
      where: { id: order.orderId },
    })).includes("integration-server-only-secret"), false);
    assert.equal(item.quantity, persistedOrder.commercialUnitQuantity);
    assert.equal(item.unit_price, Number(persistedOrder.commercialUnitPrice.toString()));
    assert.equal(capturedPayload.metadata?.commercial_unit_quantity, persistedOrder.commercialUnitQuantity);
    assert.equal(capturedPayload.metadata?.tickets_per_unit, persistedOrder.ticketsPerUnit);
    assert.equal(capturedPayload.metadata?.ticket_count, 2);
    assert.ok(new Date(String(capturedPayload?.expiration_date_to)) <= persistedOrder.expiresAt);
  } finally {
    global.fetch = previousFetch;
    if (previousAccessToken === undefined) {
      delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    } else {
      process.env.MERCADO_PAGO_ACCESS_TOKEN = previousAccessToken;
    }
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousBypassSecret === undefined) delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    else process.env.VERCEL_AUTOMATION_BYPASS_SECRET = previousBypassSecret;
  }
});

test("criacao de preferencia de evento bloqueia pedido expirado e pedido nao pendente", async () => {
  const previousFetch = global.fetch;
  const previousAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const expired = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-expired",
  });
  const paid = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-paid",
  });

  try {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-event-token";
    global.fetch = (async () => {
      throw new Error("Mercado Pago nao deve ser chamado para pedido invalido.");
    }) as typeof fetch;

    await testPrisma.eventOrder.update({
      where: { id: expired.order.orderId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await confirmEventOrderPayment({
      eventOrderId: paid.order.orderId,
      paymentId: "PREF_ALREADY_PAID",
      paidAmount: paid.order.total,
    });

    await assert.rejects(
      () => createEventPaymentPreference({ eventOrderId: expired.order.orderId, baseUrl: "https://aaau.test" }),
      /expirada/i,
    );
    await assert.rejects(
      () => createEventPaymentPreference({ eventOrderId: paid.order.orderId, baseUrl: "https://aaau.test" }),
      /Status do pedido invalido/i,
    );
  } finally {
    global.fetch = previousFetch;
    if (previousAccessToken === undefined) {
      delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    } else {
      process.env.MERCADO_PAGO_ACCESS_TOKEN = previousAccessToken;
    }
  }
});

test("processamento de pagamento invalido ou external reference divergente nao confirma", async () => {
  const missingPaymentId = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-missing-id",
  });
  const invalidAmount = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-invalid-amount",
  });
  const mismatch = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-payment-reference-mismatch",
  });
  await testPrisma.eventOrder.update({
    where: { id: mismatch.order.orderId },
    data: { externalReference: `event_order:${mismatch.order.orderId}:changed` },
  });

  assert.equal(
    (
      await processEventPayment({
        ...approvedPayment({
          id: "",
          externalReference: missingPaymentId.order.externalReference,
          amount: missingPaymentId.order.total,
        }),
        id: undefined,
      })
    ).result,
    "INVALID_PAYMENT",
  );
  assert.equal(
    (
      await processEventPayment({
        ...approvedPayment({
          id: "EVT_INVALID_AMOUNT",
          externalReference: invalidAmount.order.externalReference,
          amount: invalidAmount.order.total,
        }),
        transaction_amount: undefined,
      })
    ).result,
    "INVALID_PAYMENT",
  );
  assert.equal(
    (
      await processEventPayment(
        approvedPayment({
          id: "EVT_REFERENCE_MISMATCH",
          externalReference: mismatch.order.externalReference,
          amount: mismatch.order.total,
        }),
      )
    ).result,
    "EXTERNAL_REFERENCE_MISMATCH",
  );
  assert.equal(
    await testPrisma.eventTicket.count({
      where: { eventOrderId: { in: [missingPaymentId.order.orderId, invalidAmount.order.orderId, mismatch.order.orderId] } },
    }),
    0,
  );
});

test("preview publico de partner code nao reserva lote nem codigo", async () => {
  const { event, lot } = await createEventWithLot(10);
  const code = await createTestPartnerCode(event.id, { code: "PREVIEW10", maxUses: 3 });
  const { POST } = await import("@/app/api/eventos/partner-code/validate/route");
  const response = await POST(
    new Request("https://aaau.test/api/eventos/partner-code/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventSlug: event.slug, code: "preview10", quantity: 2 }),
    }),
  );
  const body = await response.json();
  const updatedLot = await assertLotInvariant(lot.id);
  const updatedCode = await assertPartnerInvariant(code.id);

  assert.equal(body.valid, true);
  assert.equal(updatedLot.reservedQuantity, 0);
  assert.equal(updatedCode.reservedUses, 0);
  assert.equal(updatedCode.confirmedUses, 0);
});

test("status publico de EventOrder nao retorna dados sensiveis", async () => {
  const { order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-public-status",
  });
  const accessToken = (await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).accessToken;
  const { GET } = await import("@/app/api/eventos/orders/[accessToken]/status/route");
  const response = await GET(
    new Request(`https://aaau.test/api/eventos/orders/${accessToken}/status`),
    { params: Promise.resolve({ accessToken }) },
  );
  const body = await response.json();

  assert.equal(body.status, "PENDING");
  assert.equal(body.eventName.length > 0, true);
  assert.equal("mercadoPagoPaymentId" in body, false);
  assert.equal("mercadoPagoPreferenceId" in body, false);
  assert.equal("qrToken" in body, false);
  assert.equal("idempotencyKey" in body, false);
  assert.equal("participantCpf" in body, false);
});

test("ensureEventPaymentPreference concorrente cria apenas uma preferencia externa", async () => {
  const { order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-concurrent",
  });
  const mock = installPreferenceFetchMock({});

  try {
    const results = await Promise.allSettled([
      ensureEventPaymentPreference({ eventOrderId: order.orderId, baseUrl: "https://aaau.test" }),
      ensureEventPaymentPreference({ eventOrderId: order.orderId, baseUrl: "https://aaau.test" }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const updatedOrder = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });

    assert.equal(mock.calls.create, 1);
    assert.equal(updatedOrder.paymentPreferenceStatus, "CREATED");
    assert.ok(updatedOrder.mercadoPagoPreferenceId);
    assert.equal(fulfilled.length >= 1, true);
    assert.equal(
      rejected.every(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof EventPaymentPreferenceCreatingError,
      ),
      true,
    );
  } finally {
    mock.restore();
  }
});

test("ensureEventPaymentPreference reconcilia resposta perdida sem segundo POST", async () => {
  const { order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-lost-response",
  });
  const externalPreference = compatiblePreference(order, "pref-lost-response");
  const mock = installPreferenceFetchMock({
    createResponse: async () => {
      throw new Error("network timeout after possible creation");
    },
    searchResponse: () => ({ results: [externalPreference] }),
  });

  try {
    await assert.rejects(
      () => ensureEventPaymentPreference({ eventOrderId: order.orderId, baseUrl: "https://aaau.test" }),
      EventPaymentPreferenceAmbiguousError,
    );
    const reconciled = await ensureEventPaymentPreference({
      eventOrderId: order.orderId,
      baseUrl: "https://aaau.test",
      now: new Date(Date.now() + 31_000),
    });

    assert.equal(mock.calls.create, 1);
    assert.equal(mock.calls.search, 1);
    assert.equal(reconciled.preferenceId, "pref-lost-response");
    assert.equal(
      (await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } })).paymentPreferenceStatus,
      "CREATED",
    );
  } finally {
    mock.restore();
  }
});

test("ensureEventPaymentPreference reconcilia persistencia local falha sem segundo POST", async () => {
  const { order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-bad-response",
  });
  const externalPreference = compatiblePreference(order, "pref-recovered");
  const mock = installPreferenceFetchMock({
    createResponse: () => ({ id: "pref-recovered" }),
    searchResponse: () => ({ results: [externalPreference] }),
  });

  try {
    await assert.rejects(
      () => ensureEventPaymentPreference({ eventOrderId: order.orderId, baseUrl: "https://aaau.test" }),
      EventPaymentPreferenceAmbiguousError,
    );
    const reconciled = await ensureEventPaymentPreference({
      eventOrderId: order.orderId,
      baseUrl: "https://aaau.test",
      now: new Date(Date.now() + 31_000),
    });

    assert.equal(mock.calls.create, 1);
    assert.equal(mock.calls.search, 1);
    assert.equal(reconciled.preferenceId, "pref-recovered");
  } finally {
    mock.restore();
  }
});

test("ensureEventPaymentPreference com multiplas preferencias compativeis permanece ambiguo", async () => {
  const { order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-multiple",
  });
  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: {
      paymentPreferenceStatus: "AMBIGUOUS",
      paymentPreferenceCreationStartedAt: new Date(Date.now() - 60_000),
    },
  });
  const mock = installPreferenceFetchMock({
    searchResponse: () => ({
      results: [
        compatiblePreference(order, "pref-multiple-1"),
        compatiblePreference(order, "pref-multiple-2"),
      ],
    }),
  });

  try {
    await assert.rejects(
      () => ensureEventPaymentPreference({ eventOrderId: order.orderId, baseUrl: "https://aaau.test" }),
      EventPaymentPreferenceAmbiguousError,
    );

    const updatedOrder = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
    assert.equal(mock.calls.create, 0);
    assert.equal(mock.calls.search, 1);
    assert.equal(updatedOrder.paymentPreferenceStatus, "AMBIGUOUS");
    assert.equal(updatedOrder.mercadoPagoPreferenceId, null);
  } finally {
    mock.restore();
  }
});

test("ensureEventPaymentPreference com CREATING recente nao cria outra preferencia", async () => {
  const { order } = await createReservedOrderFixture({
    quantity: 1,
    idempotencyKey: "event-preference-creating-recent",
  });
  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: {
      paymentPreferenceStatus: "CREATING",
      paymentPreferenceCreationStartedAt: new Date(),
    },
  });
  const mock = installPreferenceFetchMock({});

  try {
    await assert.rejects(
      () => ensureEventPaymentPreference({ eventOrderId: order.orderId, baseUrl: "https://aaau.test" }),
      EventPaymentPreferenceCreatingError,
    );
    assert.equal(mock.calls.create, 0);
    assert.equal(mock.calls.search, 0);
  } finally {
    mock.restore();
  }
});

test("emissao oficial e idempotente cria um ticket por participante", async () => {
  const { order } = await createPaidOrderFixture(3);
  await runSerializableTransactionWithRetry((tx) => issueEventTicketsForPaidOrder(tx, order.orderId));

  const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId } });
  assert.equal(tickets.length, 3);
  assert.equal(new Set(tickets.map((ticket) => ticket.orderParticipantId)).size, 3);
  assert.equal(new Set(tickets.map((ticket) => ticket.ticketCode)).size, 3);
  assert.equal(new Set(tickets.map((ticket) => ticket.qrToken)).size, 3);
  assert.ok(tickets.every((ticket) => ticket.status === "VALID"));
  const initialVersions = await testPrisma.eventTicketQrVersion.findMany({
    where: { ticketId: { in: tickets.map((ticket) => ticket.id) } },
  });
  assert.equal(initialVersions.length, 3);
  assert.ok(initialVersions.every((version) => version.version === 1 && version.status === "ACTIVE"));
  for (const ticket of tickets) {
    const version = initialVersions.find((candidate) => candidate.ticketId === ticket.id);
    assert.equal(version?.qrTokenHash, hashEventTicketQrToken(ticket.qrToken));
    assert.equal(version?.ticketCodeHash, hashEventTicketCode(ticket.ticketCode));
  }
});

test("checkout HTTP associa idade minima ao nascimento do participante correto", async () => {
  const event = await createTestTicketEvent({
    minimumAge: 18,
    requireBirthDate: true,
    startAt: new Date("2026-12-20T20:00:00.000Z"),
    salesEndAt: new Date("2026-12-19T20:00:00.000Z"),
  });
  const lot = await createTestTicketLot(event.id, {
    salesEndAt: new Date("2026-12-19T20:00:00.000Z"),
  });
  const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.210" },
    body: JSON.stringify({
      eventSlug: event.slug,
      ticketLotId: lot.id,
      commercialUnitQuantity: 1,
      buyer: buyer(),
      participants: [{ ...participant(), birthDate: "2012-01-01" }],
      idempotencyKey: "minimum-age-http-client-key",
    }),
  }));

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, "INVALID_PARTICIPANT_DATA");
  assert.equal(body.field, "participants.0.birthDate");
  assert.equal(body.participantIndex, 0);
  assert.match(body.message, /Participante 1 precisa ter pelo menos 18 anos/);
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
});

test("emissao reverte ticket e versao no savepoint antes de repetir colisao", async () => {
  const { lot, order } = await createPaidOrderFixture(1);
  const cpf = "52998224725";
  const participantWithCollision = await testPrisma.eventOrderParticipant.create({
    data: {
      eventOrderId: order.orderId,
      ticketLotId: lot.id,
      name: "Participante Colisao",
      cpf,
      cpfLast4: cpf.slice(-4),
    },
  });
  await testPrisma.$executeRawUnsafe('CREATE SEQUENCE "EventTicketQrVersion_collision_test_seq"');
  await testPrisma.$executeRawUnsafe(`
    CREATE FUNCTION "EventTicketQrVersion_collision_test"() RETURNS trigger AS $$
    BEGIN
      IF nextval('"EventTicketQrVersion_collision_test_seq"') = 1 THEN
        RAISE unique_violation USING MESSAGE = 'forced initial QR version collision';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await testPrisma.$executeRawUnsafe(`
    CREATE TRIGGER "EventTicketQrVersion_collision_test_trigger"
    BEFORE INSERT ON "EventTicketQrVersion"
    FOR EACH ROW EXECUTE FUNCTION "EventTicketQrVersion_collision_test"()
  `);

  try {
    const issued = await runSerializableTransactionWithRetry((tx) =>
      issueEventTicketsForPaidOrder(tx, order.orderId));
    assert.equal(issued, 1);
    assert.equal(await testPrisma.eventTicket.count({ where: { orderParticipantId: participantWithCollision.id } }), 1);
    assert.equal(await testPrisma.eventTicketQrVersion.count({
      where: { ticket: { orderParticipantId: participantWithCollision.id }, version: 1, status: "ACTIVE" },
    }), 1);
    const attempts = await testPrisma.$queryRaw<Array<{ last_value: bigint }>>`
      SELECT last_value FROM "EventTicketQrVersion_collision_test_seq"
    `;
    assert.equal(attempts[0].last_value, BigInt(2));
  } finally {
    await testPrisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "EventTicketQrVersion_collision_test_trigger" ON "EventTicketQrVersion"');
    await testPrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS "EventTicketQrVersion_collision_test"()');
    await testPrisma.$executeRawUnsafe('DROP SEQUENCE IF EXISTS "EventTicketQrVersion_collision_test_seq"');
  }
});

test("backfill cria somente versoes ausentes e a segunda escrita e idempotente", async () => {
  const { order } = await createPaidOrderFixture(3);
  const ticketsBefore = await testPrisma.eventTicket.findMany({
    where: { eventOrderId: order.orderId },
    orderBy: { id: "asc" },
  });
  await testPrisma.eventTicketQrVersion.deleteMany({
    where: { ticketId: { in: ticketsBefore.map(({ id }) => id) } },
  });
  const secret = "integration-transfer-secret-with-at-least-32-characters";
  const runBackfill = (write: boolean) => spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/backfill-event-ticket-qr-versions.ts", "backfill", ...(write ? ["--write"] : [])],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_DIRECT_URL,
        NODE_ENV: "test",
        EVENT_TICKET_TRANSFERS_ENABLED: "false",
        EVENT_TICKET_PORTAL_ENABLED: "false",
        EVENT_TICKET_TRANSFER_BACKFILL_TARGET: "staging",
        EVENT_TICKET_TRANSFER_BACKFILL_CONFIRM: "BACKFILL-STAGING",
        EVENT_TICKET_TRANSFER_BACKFILL_SECRET: secret,
        EVENT_TICKET_TRANSFER_TOKEN_SECRET: secret,
      },
    },
  );

  const dryRun = runBackfill(false);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout.trim()).wouldCreate, 3);
  assert.equal(await testPrisma.eventTicketQrVersion.count(), 0);

  const firstWrite = runBackfill(true);
  assert.equal(firstWrite.status, 0, firstWrite.stderr);
  assert.equal(JSON.parse(firstWrite.stdout.trim()).created, 3);
  const secondWrite = runBackfill(true);
  assert.equal(secondWrite.status, 0, secondWrite.stderr);
  assert.equal(JSON.parse(secondWrite.stdout.trim()).created, 0);

  const ticketsAfter = await testPrisma.eventTicket.findMany({
    where: { eventOrderId: order.orderId },
    orderBy: { id: "asc" },
  });
  assert.deepEqual(ticketsAfter, ticketsBefore);
  assert.equal(await testPrisma.eventTicketQrVersion.count({
    where: { ticketId: { in: ticketsBefore.map(({ id }) => id) }, version: 1, status: "ACTIVE" },
  }), 3);
});

test("fundacao de transferencia isola historico e acesso no segundo de tres ingressos", async () => {
  const previousFlag = process.env.EVENT_TICKET_TRANSFERS_ENABLED;
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "integration-transfer-secret-with-at-least-32-characters";

  try {
    const { order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
      orderBy: { participantName: "asc" },
    });
    assert.equal(tickets.length, 3);
    const target = tickets[1];
    const siblings = [tickets[0], tickets[2]];
    const financialOrderBefore = await testPrisma.eventOrder.findUniqueOrThrow({
      where: { id: order.orderId },
    });
    const lotBefore = await testPrisma.eventTicketLot.findUniqueOrThrow({
      where: { id: target.lotId },
    });
    const siblingSnapshot = new Map(siblings.map((ticket) => [ticket.id, {
      eventOrderId: ticket.eventOrderId,
      eventId: ticket.eventId,
      lotId: ticket.lotId,
      participantName: ticket.participantName,
      participantEmail: ticket.participantEmail,
      qrToken: ticket.qrToken,
      ticketCode: ticket.ticketCode,
      ownershipVersion: ticket.ownershipVersion,
      qrVersion: ticket.qrVersion,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
    }]));

    const transfer = await createPendingEventTicketTransfer({
      ticketId: target.id,
      toHolderName: "Novo Titular",
      toHolderEmail: "NOVO.TITULAR@event-test.local",
      expiresAt: new Date(Date.now() + 60_000),
      db: testPrisma,
    });
    const qrVersion = await ensureInitialEventTicketQrVersion(target.id, testPrisma);
    const { grant, rawToken } = await createIndividualEventTicketAccessGrant({
      ticketId: target.id,
      ownershipVersion: target.ownershipVersion,
      holderEmail: "NOVO.TITULAR@event-test.local",
      createdFromTransferId: transfer.id,
      db: testPrisma,
    });

    assert.equal(transfer.ticketId, target.id);
    assert.equal(qrVersion.ticketId, target.id);
    assert.equal(qrVersion.version, 1);
    assert.equal(grant.ticketId, target.id);
    assert.equal(grant.createdFromTransferId, transfer.id);
    assert.equal(grant.holderEmail, "novo.titular@event-test.local");
    assert.equal(grant.tokenHash.includes(rawToken), false);

    const resolved = await resolveEventTicketAccessGrant(rawToken, new Date(), testPrisma);
    assert.equal(resolved?.grant.ticketId, target.id);
    assert.equal(resolved?.ticket.id, target.id);
    assert.equal(resolved?.ticket.eventOrderId, order.orderId);
    assert.equal("accessToken" in (resolved?.ticket ?? {}), false);

    await assert.rejects(() => createIndividualEventTicketAccessGrant({
      ticketId: siblings[0].id,
      ownershipVersion: siblings[0].ownershipVersion,
      holderEmail: "invasor@event-test.local",
      createdFromTransferId: transfer.id,
      db: testPrisma,
    }), /EVENT_TICKET_TRANSFER_TICKET_MISMATCH/);
    await assert.rejects(() => createPendingEventTicketTransfer({
      ticketId: target.id,
      toHolderName: "Transferencia Concorrente",
      toHolderEmail: "concorrente@event-test.local",
      expiresAt: new Date(Date.now() + 60_000),
      db: testPrisma,
    }), /EVENT_TICKET_TRANSFER_CONFLICT/);

    const refreshed = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
    });
    assert.deepEqual(refreshed.find((ticket) => ticket.id === target.id), target);
    for (const sibling of siblings) {
      const after = refreshed.find((ticket) => ticket.id === sibling.id);
      assert.ok(after);
      assert.deepEqual({
        eventOrderId: after.eventOrderId,
        eventId: after.eventId,
        lotId: after.lotId,
        participantName: after.participantName,
        participantEmail: after.participantEmail,
        qrToken: after.qrToken,
        ticketCode: after.ticketCode,
        ownershipVersion: after.ownershipVersion,
        qrVersion: after.qrVersion,
        status: after.status,
        updatedAt: after.updatedAt,
      }, siblingSnapshot.get(sibling.id));
    }

    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: target.id } }), 1);
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: target.id } }), 1);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }), 1);
    for (const sibling of siblings) {
      assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: sibling.id } }), 0);
      assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: sibling.id } }), 0);
      assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: sibling.id } }), 1);
    }

    assert.deepEqual(
      await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } }),
      financialOrderBefore,
    );
    assert.deepEqual(
      await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: target.lotId } }),
      lotBefore,
    );

    await assert.rejects(() => createIndividualEventTicketAccessGrant({
      ticketId: target.id,
      ownershipVersion: target.ownershipVersion,
      holderEmail: "outro@event-test.local",
      db: testPrisma,
    }));
  } finally {
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED;
    else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
  }
});

test("servicos de transferencia expiram e revogam somente o ticket informado", async () => {
  const previousFlag = process.env.EVENT_TICKET_TRANSFERS_ENABLED;
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "integration-transfer-secret-with-at-least-32-characters";

  try {
    const { order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
      orderBy: { participantName: "asc" },
    });
    const now = new Date();
    const expired = await createPendingEventTicketTransfer({
      ticketId: tickets[0].id,
      toHolderName: "Destino Um",
      toHolderEmail: "destino1@event-test.local",
      expiresAt: new Date(now.getTime() - 1_000),
      db: testPrisma,
    });
    const current = await createPendingEventTicketTransfer({
      ticketId: tickets[1].id,
      toHolderName: "Destino Dois",
      toHolderEmail: "destino2@event-test.local",
      expiresAt: new Date(now.getTime() + 60_000),
      db: testPrisma,
    });
    assert.equal(eventTicketTransferIsExpired(expired, now), true);
    assert.equal(eventTicketTransferIsExpired(current, now), false);
    assert.equal((await findEventTicketTransfer(expired.id, testPrisma))?.ticketId, tickets[0].id);
    assert.equal((await findPendingEventTicketTransfer(tickets[1].id, now, testPrisma))?.id, current.id);

    const result = await expirePendingEventTicketTransfers(tickets[0].id, now, testPrisma);
    assert.equal(result.count, 1);
    assert.equal((await findEventTicketTransfer(expired.id, testPrisma))?.status, "EXPIRED");
    assert.equal((await findEventTicketTransfer(current.id, testPrisma))?.status, "PENDING_CURRENT_CONFIRMATION");

    const firstGrant = await createIndividualEventTicketAccessGrant({
      ticketId: tickets[0].id,
      ownershipVersion: 1,
      holderEmail: "holder1@event-test.local",
      db: testPrisma,
    });
    const secondGrant = await createIndividualEventTicketAccessGrant({
      ticketId: tickets[1].id,
      ownershipVersion: 1,
      holderEmail: "holder2@event-test.local",
      db: testPrisma,
    });
    assert.equal((await findActiveEventTicketAccessGrant(tickets[0].id, now, testPrisma))?.id, firstGrant.grant.id);
    assert.equal((await findActiveEventTicketAccessGrant(tickets[1].id, now, testPrisma))?.id, secondGrant.grant.id);
    const byEmail = await findActiveEventTicketAccessGrantsByHolderEmail(
      "  HOLDER2@EVENT-TEST.LOCAL ",
      now,
      testPrisma,
    );
    assert.deepEqual(byEmail.map((row) => row.ticketId), [tickets[1].id]);
    assert.equal(byEmail[0].holderEmail, "holder2@event-test.local");

    const revoked = await revokeActiveEventTicketAccessGrants(tickets[0].id, now, testPrisma);
    assert.equal(revoked.count, 1);
    assert.equal(await findActiveEventTicketAccessGrant(tickets[0].id, now, testPrisma), null);
    assert.equal((await findActiveEventTicketAccessGrant(tickets[1].id, now, testPrisma))?.id, secondGrant.grant.id);

    const qrVersion = await ensureInitialEventTicketQrVersion(tickets[1].id, testPrisma);
    assert.equal((await findActiveEventTicketQrVersion(tickets[1].id, testPrisma))?.id, qrVersion.id);
    assert.equal((await findActiveEventTicketQrVersion(tickets[0].id, testPrisma))?.version, 1);
  } finally {
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED;
    else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
  }
});

test("indices parciais e foreign keys protegem entidades individuais", async () => {
  const previousFlag = process.env.EVENT_TICKET_TRANSFERS_ENABLED;
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "integration-transfer-secret-with-at-least-32-characters";

  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    const transfer = await createPendingEventTicketTransfer({
      ticketId: ticket.id,
      toHolderName: "Destino Indice",
      toHolderEmail: "indice@event-test.local",
      expiresAt: new Date(Date.now() + 60_000),
      db: testPrisma,
    });

    await assert.rejects(
      () => testPrisma.eventTicketTransfer.create({
        data: {
          ticketId: ticket.id,
          fromOwnershipVersion: 1,
          fromHolderName: ticket.participantName,
          toHolderName: "Outro Destino",
          toHolderEmail: "outro-indice@event-test.local",
          toHolderEmailHash: "transfer-index-hash",
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );

    const firstGrant = await createIndividualEventTicketAccessGrant({
      ticketId: ticket.id,
      ownershipVersion: 1,
      holderEmail: "grant-index@event-test.local",
      createdFromTransferId: transfer.id,
      db: testPrisma,
    });
    await assert.rejects(
      () => testPrisma.eventTicketAccessGrant.create({
        data: {
          ticketId: ticket.id,
          ownershipVersion: 1,
          holderEmail: "segundo-grant@event-test.local",
          holderEmailHash: "second-grant-holder-hash",
          tokenHash: "second-grant-token-hash",
        },
      }),
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );

    const firstQrVersion = await ensureInitialEventTicketQrVersion(ticket.id, testPrisma);
    await assert.rejects(
      () => testPrisma.eventTicketQrVersion.create({
        data: {
          ticketId: ticket.id,
          version: 2,
          qrTokenHash: "second-active-qr-hash",
          ticketCodeHash: "second-active-code-hash",
          status: "ACTIVE",
          issuedAt: new Date(),
        },
      }),
      (error) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );

    assert.equal((await findPendingEventTicketTransfer(ticket.id, new Date(), testPrisma))?.id, transfer.id);
    assert.equal((await findActiveEventTicketAccessGrant(ticket.id, new Date(), testPrisma))?.id, firstGrant.grant.id);
    assert.equal((await findActiveEventTicketQrVersion(ticket.id, testPrisma))?.id, firstQrVersion.id);

    await assert.rejects(
      () => createPendingEventTicketTransfer({
        ticketId: "ticket-inexistente",
        toHolderName: "Destino",
        toHolderEmail: "missing@event-test.local",
        expiresAt: new Date(Date.now() + 60_000),
        db: testPrisma,
      }),
      /EVENT_TICKET_NOT_FOUND/,
    );
    await assert.rejects(
      () => createIndividualEventTicketAccessGrant({
        ticketId: "ticket-inexistente",
        ownershipVersion: 1,
        holderEmail: "missing@event-test.local",
        db: testPrisma,
      }),
      /EVENT_TICKET_OWNERSHIP_VERSION_MISMATCH/,
    );
  } finally {
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED;
    else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
  }
});

test("feature flag bloqueia mutacoes e transacao falha faz rollback integral", async () => {
  const previousFlag = process.env.EVENT_TICKET_TRANSFERS_ENABLED;
  const previousSecret = process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
  process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = "integration-transfer-secret-with-at-least-32-characters";

  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
    await assert.rejects(() => createPendingEventTicketTransfer({
      ticketId: ticket.id,
      toHolderName: "Bloqueado",
      toHolderEmail: "bloqueado@event-test.local",
      expiresAt: new Date(Date.now() + 60_000),
      db: testPrisma,
    }), /EVENT_TICKET_TRANSFERS_DISABLED/);
    await assert.rejects(() => createIndividualEventTicketAccessGrant({
      ticketId: ticket.id,
      ownershipVersion: 1,
      holderEmail: "bloqueado@event-test.local",
      db: testPrisma,
    }), /EVENT_TICKET_TRANSFERS_DISABLED/);

    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
    await assert.rejects(() => runSerializableTransactionWithRetry(async (tx) => {
      const transfer = await createPendingEventTicketTransfer({
        ticketId: ticket.id,
        toHolderName: "Rollback",
        toHolderEmail: "rollback@event-test.local",
        expiresAt: new Date(Date.now() + 60_000),
        db: tx,
      });
      await ensureInitialEventTicketQrVersion(ticket.id, tx);
      await createIndividualEventTicketAccessGrant({
        ticketId: ticket.id,
        ownershipVersion: 1,
        holderEmail: "rollback@event-test.local",
        createdFromTransferId: transfer.id,
        db: tx,
      });
      throw new Error("FORCED_TRANSFER_ROLLBACK");
    }), /FORCED_TRANSFER_ROLLBACK/);

    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: ticket.id } }), 0);
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: ticket.id } }), 0);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: ticket.id } }), 1);
    assert.deepEqual(
      await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }),
      ticket,
    );
  } finally {
    if (previousFlag === undefined) delete process.env.EVENT_TICKET_TRANSFERS_ENABLED;
    else process.env.EVENT_TICKET_TRANSFERS_ENABLED = previousFlag;
    if (previousSecret === undefined) delete process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET;
    else process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = previousSecret;
  }
});

test("conclusao de transferencia rotaciona somente o segundo de tres ingressos e e idempotente", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { event, lot, order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
      orderBy: { participantName: "asc" },
    });
    const target = tickets[1];
    const siblings = [tickets[0], tickets[2]];
    const originalParticipant = await testPrisma.eventOrderParticipant.findUniqueOrThrow({
      where: { id: target.orderParticipantId },
    });
    const orderBefore = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
    const lotBefore = await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } });

    await ensureInitialEventTicketQrVersion(target.id, testPrisma);
    const oldGrant = await createIndividualEventTicketAccessGrant({
      ticketId: target.id,
      ownershipVersion: target.ownershipVersion,
      holderEmail: target.participantEmail ?? "titular-anterior@event-test.local",
      db: testPrisma,
    });
    const transfer = await createReadyTransfer(target.id);

    const result = await completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: target.id,
      expectedOwnershipVersion: target.ownershipVersion,
      recipient: transferRecipient,
    });
    assert.equal(result.alreadyCompleted, false);
    assert.equal(result.ticketId, target.id);
    assert.equal(result.ownershipVersion, 2);
    assert.equal(result.qrVersion, 2);
    assert.ok(result.rawAccessToken);
    assert.notEqual(result.delivery.qrToken, target.qrToken);
    assert.notEqual(result.delivery.ticketCode, target.ticketCode);

    const updated = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(updated.id, target.id);
    assert.equal(updated.eventOrderId, target.eventOrderId);
    assert.equal(updated.eventId, target.eventId);
    assert.equal(updated.lotId, target.lotId);
    assert.equal(updated.participantName, transferRecipient.name);
    assert.equal(updated.participantEmail, transferRecipient.email);
    assert.equal(updated.participantCpf, transferRecipient.cpf);
    assert.equal(updated.ownershipVersion, 2);
    assert.equal(updated.qrVersion, 2);
    assert.ok(updated.originalOrderAccessRevokedAt);
    assert.ok(updated.transferredAt);
    assert.ok(updated.lastQrRotatedAt);
    assert.deepEqual(
      await testPrisma.eventOrderParticipant.findUniqueOrThrow({ where: { id: target.orderParticipantId } }),
      originalParticipant,
    );
    for (const sibling of siblings) {
      assert.deepEqual(
        await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: sibling.id } }),
        sibling,
      );
      assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: sibling.id } }), 0);
      assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: sibling.id } }), 1);
      assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, sibling.qrToken)).status, "VALID");
      assert.equal((await validatePortariaManualTicket(superAdminActor, event.id, sibling.ticketCode)).status, "VALID");
    }
    assert.deepEqual(await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } }), orderBefore);
    assert.deepEqual(await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } }), lotBefore);

    assert.equal(await testPrisma.eventTicket.findUnique({ where: { qrToken: target.qrToken } }), null);
    assert.equal(await testPrisma.eventTicket.findUnique({ where: { ticketCode: target.ticketCode } }), null);
    assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, target.qrToken)).status, "INVALID");
    assert.equal((await validatePortariaManualTicket(superAdminActor, event.id, target.ticketCode)).status, "INVALID");
    assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, updated.qrToken)).status, "VALID");
    assert.equal((await validatePortariaManualTicket(superAdminActor, event.id, updated.ticketCode)).status, "VALID");

    const qrHistory = await testPrisma.eventTicketQrVersion.findMany({
      where: { ticketId: target.id },
      orderBy: { version: "asc" },
    });
    assert.deepEqual(qrHistory.map(({ version, status }) => ({ version, status })), [
      { version: 1, status: "REVOKED" },
      { version: 2, status: "ACTIVE" },
    ]);
    assert.equal(qrHistory[0].revocationReason, "TRANSFER_COMPLETED");
    assert.equal(qrHistory[0].transferId, transfer.id);
    assert.equal(qrHistory[1].transferId, transfer.id);
    assert.equal(qrHistory[0].qrTokenHash, hashEventTicketQrToken(target.qrToken));
    assert.equal(qrHistory[0].ticketCodeHash, hashEventTicketCode(target.ticketCode));
    assert.equal(qrHistory[1].qrTokenHash, hashEventTicketQrToken(updated.qrToken));
    assert.equal(qrHistory[1].ticketCodeHash, hashEventTicketCode(updated.ticketCode));

    const grants = await testPrisma.eventTicketAccessGrant.findMany({ where: { ticketId: target.id } });
    assert.equal(grants.length, 2);
    assert.ok(grants.find(({ id }) => id === oldGrant.grant.id)?.revokedAt);
    const activeGrant = grants.find(({ revokedAt }) => revokedAt === null);
    assert.equal(activeGrant?.createdFromTransferId, transfer.id);
    assert.equal(activeGrant?.ownershipVersion, 2);
    const resolved = await resolveEventTicketAccessGrant(result.rawAccessToken!, new Date(), testPrisma);
    assert.equal(resolved?.ticket.id, target.id);

    const completedTransfer = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    assert.equal(completedTransfer.status, "COMPLETED");
    assert.equal(completedTransfer.toOwnershipVersion, 2);
    assert.ok(completedTransfer.completedAt);
    const persisted = JSON.stringify(completedTransfer);
    for (const secret of [target.qrToken, target.ticketCode, updated.qrToken, updated.ticketCode,
      result.rawAccessToken!, transferRecipient.cpf, orderBefore.accessToken]) {
      assert.equal(persisted.includes(secret), false);
    }
    const audit = await testPrisma.eventAdminAuditLog.findFirstOrThrow({
      where: { targetId: target.id, action: "EVENT_TICKET_TRANSFER_COMPLETED" },
    });
    const auditJson = JSON.stringify(audit.metadata);
    assert.equal(auditJson.includes(transferRecipient.cpf), false);
    assert.equal(auditJson.includes(result.rawAccessToken!), false);
    assert.equal(auditJson.includes(orderBefore.accessToken), false);

    const countsBeforeReplay = {
      grants: await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: target.id } }),
      qr: await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }),
      audit: await testPrisma.eventAdminAuditLog.count({ where: { targetId: target.id } }),
    };
    const replay = await completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: target.id,
      expectedOwnershipVersion: target.ownershipVersion,
      recipient: transferRecipient,
    });
    assert.equal(replay.alreadyCompleted, true);
    assert.equal(replay.rawAccessToken, null);
    assert.equal(replay.delivery.qrToken, updated.qrToken);
    assert.deepEqual({
      grants: await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: target.id } }),
      qr: await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }),
      audit: await testPrisma.eventAdminAuditLog.count({ where: { targetId: target.id } }),
    }, countsBeforeReplay);
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: target.id,
      expectedOwnershipVersion: 0,
      recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_IDEMPOTENCY_CONFLICT/);
  } finally {
    restore();
  }
});

test("secret divergente reproduz a falha e reparo legacy e idempotente libera a conclusao", async () => {
  const restore = enableTransferTestEnvironment();
  const secretA = "integration-backfill-secret-a-with-at-least-32-characters";
  const secretB = "integration-runtime-secret-b-with-at-least-32-characters";
  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = secretA;
    await ensureInitialEventTicketQrVersion(ticket.id, testPrisma);
    const versionWithSecretA = await testPrisma.eventTicketQrVersion.findFirstOrThrow({ where: { ticketId: ticket.id } });

    process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = secretB;
    const transfer = await createReadyTransfer(ticket.id);
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: ticket.id,
      expectedOwnershipVersion: 1,
      recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_QR_VERSION_INCONSISTENT/);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }), ticket);
    assert.deepEqual(
      await testPrisma.eventTicketQrVersion.findFirstOrThrow({ where: { ticketId: ticket.id } }),
      versionWithSecretA,
    );

    const verifyBefore = await verifyEventTicketCredentialHashes({ db: testPrisma, secret: secretB, batchSize: 1 });
    assert.equal(verifyBefore.metrics.credentialHashMismatches, 1);
    assert.equal(verifyBefore.metrics.legacyEligibleForRepair, 1);
    assert.equal(verifyBefore.metrics.inconsistentVersions, 0);
    const dryRun = await repairLegacyEventTicketCredentialHashes({ db: testPrisma, secret: secretB, batchSize: 1 });
    assert.deepEqual({ repaired: dryRun.repaired, wouldRepair: dryRun.wouldRepair }, { repaired: 0, wouldRepair: 1 });
    assert.deepEqual(
      await testPrisma.eventTicketQrVersion.findFirstOrThrow({ where: { ticketId: ticket.id } }),
      versionWithSecretA,
    );

    const firstRepair = await repairLegacyEventTicketCredentialHashes({
      db: testPrisma, secret: secretB, batchSize: 1, write: true,
    });
    assert.equal(firstRepair.repaired, 1);
    assert.equal(firstRepair.after.metrics.credentialHashMismatches, 0);
    const secondRepair = await repairLegacyEventTicketCredentialHashes({
      db: testPrisma, secret: secretB, batchSize: 1, write: true,
    });
    assert.equal(secondRepair.repaired, 0);
    assert.equal(secondRepair.after.metrics.credentialHashMismatches, 0);

    const completed = await completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: ticket.id,
      expectedOwnershipVersion: 1,
      recipient: transferRecipient,
    });
    assert.equal(completed.ownershipVersion, 2);
    assert.equal(completed.qrVersion, 2);
  } finally {
    restore();
  }
});

test("reparo recusa estado estrutural inconsistente e nunca altera ingresso transferido", async () => {
  const restore = enableTransferTestEnvironment();
  const legacySecret = "integration-legacy-secret-with-at-least-32-characters";
  const runtimeSecret = "integration-current-secret-with-at-least-32-characters";
  try {
    const { order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { id: "asc" } });
    process.env.EVENT_TICKET_TRANSFER_TOKEN_SECRET = legacySecret;
    await Promise.all(tickets.map((ticket) => ensureInitialEventTicketQrVersion(ticket.id, testPrisma)));
    await testPrisma.eventTicket.update({
      where: { id: tickets[0].id },
      data: { ownershipVersion: 2, transferredAt: new Date(), originalOrderAccessRevokedAt: new Date() },
    });
    await testPrisma.eventTicketQrVersion.update({
      where: { ticketId_version: { ticketId: tickets[1].id, version: 1 } },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const before = await testPrisma.eventTicketQrVersion.findMany({ orderBy: { id: "asc" } });
    const verify = await verifyEventTicketCredentialHashes({ db: testPrisma, secret: runtimeSecret });
    assert.equal(verify.metrics.transferredTickets, 1);
    assert.equal(verify.metrics.notAutomaticallyRepairable, 2);
    assert.equal(verify.metrics.inconsistentVersions, 1);
    await assert.rejects(() => repairLegacyEventTicketCredentialHashes({
      db: testPrisma, secret: runtimeSecret, write: true,
    }), /EVENT_TICKET_HASH_REPAIR_STRUCTURAL_INCONSISTENCY/);
    assert.deepEqual(await testPrisma.eventTicketQrVersion.findMany({ orderBy: { id: "asc" } }), before);
  } finally {
    restore();
  }
});

test("conclusao rejeita flag, versao, estado, expiracao, pedido e ticket divergente sem mutacao", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
      orderBy: { participantName: "asc" },
    });
    const transfer = await createReadyTransfer(tickets[0].id);

    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id, ticketId: tickets[0].id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFERS_DISABLED/);
    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "true";
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id, ticketId: tickets[1].id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_TICKET_MISMATCH/);
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: "transfer-inexistente", ticketId: tickets[0].id,
      expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_NOT_FOUND/);
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id, ticketId: tickets[0].id, expectedOwnershipVersion: 2, recipient: transferRecipient,
    }), /EVENT_TICKET_OWNERSHIP_VERSION_MISMATCH/);

    await testPrisma.eventTicketTransfer.update({ where: { id: transfer.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id, ticketId: tickets[0].id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_EXPIRED/);
    await testPrisma.eventTicketTransfer.update({
      where: { id: transfer.id }, data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    await testPrisma.eventTicket.update({
      where: { id: tickets[0].id }, data: { status: "USED", checkedInAt: new Date() },
    });
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id, ticketId: tickets[0].id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_TICKET_INVALID/);
    await testPrisma.eventTicket.update({
      where: { id: tickets[0].id }, data: { status: "VALID", checkedInAt: null },
    });
    await testPrisma.eventOrder.update({ where: { id: order.orderId }, data: { status: "PENDING" } });
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id, ticketId: tickets[0].id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_ORDER_NOT_PAID/);

    await testPrisma.eventOrder.update({ where: { id: order.orderId }, data: { status: "PAID" } });
    const snapshot = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[0].id } });
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: tickets[0].id,
      expectedOwnershipVersion: 1,
      recipient: { ...transferRecipient, email: "outro@event-test.local" },
    }), /EVENT_TICKET_TRANSFER_RECIPIENT_MISMATCH/);
    const unconfirmed = await createPendingEventTicketTransfer({
      ticketId: tickets[2].id,
      toHolderName: transferRecipient.name,
      toHolderEmail: transferRecipient.email,
      expiresAt: new Date(Date.now() + 60_000),
      db: testPrisma,
    });
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: unconfirmed.id, ticketId: tickets[2].id,
      expectedOwnershipVersion: 1, recipient: transferRecipient,
    }), /EVENT_TICKET_TRANSFER_INVALID_STATUS/);
    await testPrisma.eventTicketTransfer.update({
      where: { id: unconfirmed.id },
      data: { status: "PENDING_RECIPIENT_ACCEPTANCE", currentHolderConfirmedAt: new Date(), recipientConfirmedAt: new Date() },
    });
    for (const status of ["CANCELED", "REFUNDED"] as const) {
      await testPrisma.eventTicket.update({ where: { id: tickets[2].id }, data: { status } });
      await assert.rejects(() => completeEventTicketTransfer({
        transferId: unconfirmed.id, ticketId: tickets[2].id,
        expectedOwnershipVersion: 1, recipient: transferRecipient,
      }), /EVENT_TICKET_TRANSFER_TICKET_INVALID/);
    }
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[0].id } }), snapshot);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: tickets[0].id } }), 1);
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: tickets[0].id } }), 0);
  } finally {
    restore();
  }
});

test("falhas injetadas fazem rollback integral em todas as etapas criticas", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const failurePoints = [
      "AFTER_REVOKE_QR",
      "AFTER_GENERATE_CREDENTIALS",
      "AFTER_UPDATE_TICKET",
      "AFTER_CREATE_QR_VERSION",
      "AFTER_CREATE_GRANT",
      "BEFORE_COMPLETE_TRANSFER",
    ] as const;
    const firstOrder = await createPaidOrderFixture(3);
    const secondOrder = await createPaidOrderFixture(3);
    const tickets = [
      ...await testPrisma.eventTicket.findMany({
        where: { eventOrderId: firstOrder.order.orderId }, orderBy: { participantName: "asc" },
      }),
      ...await testPrisma.eventTicket.findMany({
        where: { eventOrderId: secondOrder.order.orderId }, orderBy: { participantName: "asc" },
      }),
    ];

    for (const [index, failAt] of failurePoints.entries()) {
      const ticket = tickets[index];
      await ensureInitialEventTicketQrVersion(ticket.id, testPrisma);
      const oldGrant = await createIndividualEventTicketAccessGrant({
        ticketId: ticket.id,
        ownershipVersion: 1,
        holderEmail: ticket.participantEmail!,
        db: testPrisma,
      });
      const transfer = await createReadyTransfer(ticket.id, {
        ...transferRecipient,
        name: `Nova Titular ${index}`,
        email: `rollback${index}@event-test.local`,
      });
      const recipient = {
        ...transferRecipient,
        name: `Nova Titular ${index}`,
        email: `rollback${index}@event-test.local`,
      };
      const before = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });

      await assert.rejects(() => completeEventTicketTransfer({
        transferId: transfer.id,
        ticketId: ticket.id,
        expectedOwnershipVersion: 1,
        recipient,
        testHooks: { failAt },
      }), new RegExp(failAt));

      assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }), before);
      const qr = await testPrisma.eventTicketQrVersion.findMany({ where: { ticketId: ticket.id } });
      assert.equal(qr.length, 1);
      assert.equal(qr[0].status, "ACTIVE");
      assert.equal(qr[0].revokedAt, null);
      const grant = await testPrisma.eventTicketAccessGrant.findUniqueOrThrow({ where: { id: oldGrant.grant.id } });
      assert.equal(grant.revokedAt, null);
      assert.equal((await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status,
        "PENDING_RECIPIENT_ACCEPTANCE");
      assert.equal(await testPrisma.eventAdminAuditLog.count({ where: { targetId: ticket.id } }), 0);
    }
    for (const ticket of tickets) {
      assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }), ticket);
    }
  } finally {
    restore();
  }
});

test("colisoes de QR e codigo sao regeneradas sem alterar ingresso irmao", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" },
    });
    const target = tickets[0];
    const sibling = tickets[1];
    await ensureInitialEventTicketQrVersion(target.id, testPrisma);
    const transfer = await createReadyTransfer(target.id);
    let qrCalls = 0;
    let codeCalls = 0;
    const result = await completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: target.id,
      expectedOwnershipVersion: 1,
      recipient: transferRecipient,
      testHooks: {
        generateQrToken: () => qrCalls++ === 0 ? sibling.qrToken : generateEventTicketQrToken(),
        generateTicketCode: () => codeCalls++ === 0 ? sibling.ticketCode : generateEventTicketCode(),
      },
    });
    assert.equal(qrCalls, 2);
    assert.equal(codeCalls, 2);
    assert.notEqual(result.delivery.qrToken, sibling.qrToken);
    assert.notEqual(result.delivery.ticketCode, sibling.ticketCode);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: sibling.id } }), sibling);
  } finally {
    restore();
  }
});

test("transferencia e check-in QR ou manual concorrem e apenas uma transicao vence", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { event, order } = await createPaidOrderFixture(2);
    const admin = await createTestAdminUser();
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" },
    });

    for (const [index, source] of (["QR", "MANUAL"] as const).entries()) {
      const ticket = tickets[index];
      await ensureInitialEventTicketQrVersion(ticket.id, testPrisma);
      const recipient = {
        ...transferRecipient,
        name: `Concorrente ${source}`,
        email: `concorrente-${source.toLowerCase()}@event-test.local`,
      };
      const transfer = await createReadyTransfer(ticket.id, recipient);
      const checkIn = source === "QR"
        ? confirmEventTicketCheckIn({
          eventId: event.id,
          qrToken: ticket.qrToken,
          adminUserId: admin.id,
          source,
        })
        : confirmPortariaManualTicket(superAdminActor, event.id, ticket.ticketCode);
      const results = await Promise.allSettled([
        completeEventTicketTransfer({
          transferId: transfer.id,
          ticketId: ticket.id,
          expectedOwnershipVersion: 1,
          recipient,
        }),
        checkIn,
      ]);
      const transferSucceeded = results[0].status === "fulfilled";
      const checkInSucceeded = results[1].status === "fulfilled" &&
        (source === "QR" || results[1].value.status === "CHECKED_IN");
      assert.notEqual(transferSucceeded, checkInSucceeded);
      const currentTicket = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
      const currentTransfer = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
      const transferWon = currentTransfer.status === "COMPLETED";
      assert.equal(transferWon, currentTicket.status === "VALID");
      assert.equal(transferWon, currentTicket.ownershipVersion === 2);
      assert.equal(!transferWon, currentTicket.status === "USED");
      if (transferWon) {
        assert.equal(await testPrisma.eventTicket.findUnique({ where: { qrToken: ticket.qrToken } }), null);
        assert.equal(await testPrisma.eventTicket.findUnique({ where: { ticketCode: ticket.ticketCode } }), null);
      } else {
        assert.equal(currentTicket.qrToken, ticket.qrToken);
        assert.equal(currentTicket.ticketCode, ticket.ticketCode);
        assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: ticket.id } }), 0);
      }
    }
  } finally {
    restore();
  }
});

test("conclusoes concorrentes sao idempotentes e tickets distintos do mesmo pedido nao interferem", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" },
    });
    await Promise.all(tickets.slice(0, 2).map((ticket) => ensureInitialEventTicketQrVersion(ticket.id, testPrisma)));
    const recipients = [
      transferRecipient,
      { ...transferRecipient, name: "Segunda Nova Titular", cpf: "39053344705", email: "segunda@event-test.local" },
    ];
    const transfers = await Promise.all(tickets.slice(0, 2).map((ticket, index) =>
      createReadyTransfer(ticket.id, recipients[index])));

    const sameTransferResults = await Promise.all([
      completeEventTicketTransfer({ transferId: transfers[0].id, ticketId: tickets[0].id,
        expectedOwnershipVersion: 1, recipient: recipients[0] }),
      completeEventTicketTransfer({ transferId: transfers[0].id, ticketId: tickets[0].id,
        expectedOwnershipVersion: 1, recipient: recipients[0] }),
      completeEventTicketTransfer({ transferId: transfers[1].id, ticketId: tickets[1].id,
        expectedOwnershipVersion: 1, recipient: recipients[1] }),
    ]);
    assert.equal(sameTransferResults.filter(({ ticketId }) => ticketId === tickets[0].id).length, 2);
    assert.equal(sameTransferResults.filter(({ alreadyCompleted }) => alreadyCompleted).length, 1);
    for (const ticket of tickets.slice(0, 2)) {
      const updated = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
      assert.equal(updated.ownershipVersion, 2);
      assert.equal(updated.qrVersion, 2);
      assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: ticket.id, revokedAt: null } }), 1);
      assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: ticket.id } }), 2);
      assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: ticket.id, status: "ACTIVE" } }), 1);
    }
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[2].id } }), tickets[2]);
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: tickets[2].id } }), 0);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: tickets[2].id } }), 1);
  } finally {
    restore();
  }
});

test("check-in concorrente confirma uma entrada e registra uma duplicada", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const admin = await createTestAdminUser();
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
  const results = await Promise.allSettled([
    confirmEventTicketCheckIn({
      eventId: event.id,
      qrToken: ticket.qrToken,
      adminUserId: admin.id,
      source: "QR",
    }),
    confirmEventTicketCheckIn({
      eventId: event.id,
      qrToken: ticket.qrToken,
      adminUserId: admin.id,
      source: "QR",
    }),
  ]);

  expectOneSuccessOneFailure(results);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof TicketAlreadyUsedError);

  const updatedTicket = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(updatedTicket.status, "USED");
  assert.ok(updatedTicket.checkedInAt);
  assert.equal(await testPrisma.eventCheckInLog.count({ where: { ticketId: ticket.id, result: "CHECKED_IN" } }), 1);
});

test("check-in de evento incorreto nao utiliza ingresso", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const otherEvent = await createTestTicketEvent();
  await createTestTicketLot(otherEvent.id);
  const admin = await createTestAdminUser();
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  await assert.rejects(() =>
    confirmEventTicketCheckIn({
      eventId: otherEvent.id,
      qrToken: ticket.qrToken,
      adminUserId: admin.id,
      source: "QR",
    }),
  );

  const updatedTicket = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(updatedTicket.eventId, event.id);
  assert.equal(updatedTicket.status, "VALID");
  assert.equal(updatedTicket.checkedInAt, null);
  assert.equal(await testPrisma.eventCheckInLog.count({ where: { ticketId: ticket.id, result: "CHECKED_IN" } }), 0);
  assert.equal(await testPrisma.eventCheckInLog.count({ where: { ticketId: ticket.id, result: "WRONG_EVENT" } }), 1);
});

test("portaria autoriza event_staff somente no evento atribuido", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const otherEvent = await createTestTicketEvent();
  await createTestTicketLot(otherEvent.id);
  const staff = await createTestAdminUser();
  const actor = { role: "event_staff" as const, email: staff.email, adminUserId: staff.id };
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  await assert.rejects(
    () => validatePortariaQrTicketDto(actor, event.id, ticket.qrToken),
    /Acesso nao autorizado/,
  );

  await assignEventStaff({ actor: superAdminActor, eventId: event.id, adminUserId: staff.id });
  const valid = await validatePortariaQrTicketDto(actor, event.id, ticket.qrToken);
  assert.equal(valid.status, "VALID");
  assert.equal(valid.ticket?.participantName, participant(0).name);
  assert.equal("qrToken" in valid, false);
  assert.equal(valid.ticket ? "qrToken" in valid.ticket : false, false);

  await assert.rejects(
    () => validatePortariaQrTicketDto(actor, otherEvent.id, ticket.qrToken),
    /Acesso nao autorizado/,
  );
});

test("portaria bloqueia assignment inativo e AdminUser inativo", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const staff = await createTestAdminUser();
  const actor = { role: "event_staff" as const, email: staff.email, adminUserId: staff.id };
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
  const assignment = await assignEventStaff({ actor: superAdminActor, eventId: event.id, adminUserId: staff.id });

  await testPrisma.eventStaffAssignment.update({ where: { id: assignment.id }, data: { active: false } });
  await assert.rejects(() => validatePortariaQrTicketDto(actor, event.id, ticket.qrToken), /Acesso nao autorizado/);

  await testPrisma.eventStaffAssignment.update({ where: { id: assignment.id }, data: { active: true } });
  await testPrisma.adminUser.update({ where: { id: staff.id }, data: { isActive: false } });
  await assert.rejects(() => validatePortariaQrTicketDto(actor, event.id, ticket.qrToken), /Acesso nao autorizado/);
});

test("portaria confirma QR, registra operador e lista ultimas entradas", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const staff = await createTestAdminUser();
  const actor = { role: "event_staff" as const, email: staff.email, adminUserId: staff.id };
  await assignEventStaff({ actor: superAdminActor, eventId: event.id, adminUserId: staff.id });
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  const result = await confirmPortariaQrTicket(actor, event.id, ticket.qrToken);
  assert.equal(result.status, "CHECKED_IN");
  assert.equal(result.ticket?.ticketCode, ticket.ticketCode);
  assert.equal(result.ticket ? "qrToken" in result.ticket : false, false);

  const duplicate = await confirmPortariaQrTicket(actor, event.id, ticket.qrToken);
  assert.equal(duplicate.status, "ALREADY_USED");

  const log = await testPrisma.eventCheckInLog.findFirstOrThrow({
    where: { ticketId: ticket.id, result: "CHECKED_IN" },
  });
  assert.equal(log.adminUserId, staff.id);
  assert.equal(log.action, "QR_CONFIRM");

  const entries = await getLatestPortariaEntries(actor, event.id, 10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].ticketCode, ticket.ticketCode);
});

test("portaria busca e confirma check-in manual com CPF hash e ticketCode", async () => {
  const { event } = await createPaidOrderFixture(1);
  const staff = await createTestAdminUser();
  const actor = { role: "event_staff" as const, email: staff.email, adminUserId: staff.id };
  await assignEventStaff({ actor: superAdminActor, eventId: event.id, adminUserId: staff.id });
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventId: event.id } });

  const byTicketCode = await searchPortariaTickets(actor, event.id, ticket.ticketCode.toLowerCase());
  assert.equal(byTicketCode.length, 1);
  const byCpf = await searchPortariaTickets(actor, event.id, participant(0).cpf);
  assert.equal(byCpf.length, 1);
  const byName = await searchPortariaTickets(actor, event.id, "Participante");
  assert.ok(byName.length <= 20);

  const result = await confirmPortariaManualTicket(actor, event.id, ticket.ticketCode);
  assert.equal(result.status, "CHECKED_IN");
  const duplicate = await confirmPortariaManualTicket(actor, event.id, ticket.ticketCode);
  assert.equal(duplicate.status, "ALREADY_USED");

  const log = await testPrisma.eventCheckInLog.findFirstOrThrow({
    where: { ticketId: ticket.id, result: "CHECKED_IN" },
  });
  assert.equal(log.action, "MANUAL_CONFIRM");
  assert.equal(log.adminUserId, staff.id);
});

test("portaria super_admin acessa evento sem assignment", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
  const actor = { role: "super_admin" as const, email: "super-admin@event-test.local", adminUserId: null };

  const valid = await validatePortariaQrTicketDto(actor, event.id, ticket.qrToken);
  assert.equal(valid.status, "VALID");
  const confirmed = await confirmPortariaQrTicket(actor, event.id, ticket.qrToken);
  assert.equal(confirmed.status, "CHECKED_IN");
});

test("portaria relê assignment e AdminUser antes de cada operacao critica", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const staff = await createTestAdminUser();
  const actor = { role: "event_staff" as const, email: staff.email, adminUserId: staff.id };
  const assignment = await assignEventStaff({ actor: superAdminActor, eventId: event.id, adminUserId: staff.id });
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  assert.equal((await validatePortariaQrTicketDto(actor, event.id, ticket.qrToken)).status, "VALID");
  await testPrisma.eventStaffAssignment.update({ where: { id: assignment.id }, data: { active: false } });
  await assert.rejects(() => confirmPortariaQrTicket(actor, event.id, ticket.qrToken), /Acesso nao autorizado/);

  await testPrisma.eventStaffAssignment.update({ where: { id: assignment.id }, data: { active: true } });
  await testPrisma.adminUser.update({ where: { id: staff.id }, data: { isActive: false } });
  await assert.rejects(() => confirmPortariaManualTicket(actor, event.id, ticket.ticketCode), /Acesso nao autorizado/);

  assert.equal((await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } })).status, "VALID");
});

test("portaria QR de outro evento retorna somente WRONG_EVENT", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const otherEvent = await createTestTicketEvent();
  await createTestTicketLot(otherEvent.id);
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  const result = await validatePortariaQrTicketDto(superAdminActor, otherEvent.id, ticket.qrToken);
  assert.deepEqual(result, { status: "WRONG_EVENT", ticket: null });
});

test("portaria QR e MANUAL concorrentes confirmam exatamente uma entrada", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const staff = await createTestAdminUser();
  const actor = { role: "event_staff" as const, email: staff.email, adminUserId: staff.id };
  await assignEventStaff({ actor: superAdminActor, eventId: event.id, adminUserId: staff.id });
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  const results = await Promise.allSettled([
    confirmPortariaQrTicket(actor, event.id, ticket.qrToken),
    confirmPortariaManualTicket(actor, event.id, ticket.ticketCode),
  ]);
  const values = results.map((result) => {
    assert.equal(result.status, "fulfilled");
    return result.status === "fulfilled" ? result.value : null;
  });
  assert.equal(values.filter((value) => value?.status === "CHECKED_IN").length, 1);
  assert.equal(values.filter((value) => value?.status === "ALREADY_USED").length, 1);

  const updated = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } });
  assert.equal(updated.status, "USED");
  assert.ok(updated.checkedInAt);
  assert.equal(updated.checkedInByUserId, staff.id);

  const successLogs = await testPrisma.eventCheckInLog.findMany({
    where: { ticketId: ticket.id, result: "CHECKED_IN" },
  });
  assert.equal(successLogs.length, 1);
  assert.equal(successLogs[0].adminUserId, staff.id);
  assert.ok(["QR_CONFIRM", "MANUAL_CONFIRM"].includes(successLogs[0].action));
});

test("portaria DTOs omitem tokens, dados financeiros e busca curta", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  const validated = await validatePortariaQrTicketDto(superAdminActor, event.id, ticket.qrToken);
  const manual = await validatePortariaManualTicket(superAdminActor, event.id, ticket.ticketCode);
  const serialized = JSON.stringify({ validated, manual });
  for (const field of ["qrToken", "accessToken", "subtotal", "discountAmount", "total", "mercadoPagoPaymentId"]) {
    assert.equal(serialized.includes(field), false);
  }
  assert.deepEqual(await searchPortariaTickets(superAdminActor, event.id, "ab"), []);
});

test("autenticacao event_staff e super_admin preserva identidade sem senha na sessao", async () => {
  const password = "Senha-Portaria-7B";
  const staff = await testPrisma.adminUser.create({
    data: {
      name: "Staff autenticacao",
      email: "auth-staff@event-test.local",
      passwordHash: await hashPassword(password),
      role: "event_staff",
      isActive: true,
    },
  });
  const previous = {
    jwt: process.env.JWT_SECRET,
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  };
  process.env.JWT_SECRET = "integration-session-secret";
  process.env.ADMIN_EMAIL = "legacy-super@event-test.local";
  process.env.ADMIN_PASSWORD = "Legacy-Super-Password";

  try {
    const actor = await authenticateAdmin(staff.email, password);
    assert.deepEqual(actor, { email: staff.email, role: "event_staff", adminUserId: staff.id });
    assert.equal(await authenticateAdmin(staff.email, "senha-incorreta"), null);

    const token = createAdminSessionToken(actor!, process.env.JWT_SECRET);
    const session = parseAdminSessionToken(token, process.env.JWT_SECRET);
    assert.deepEqual(Object.keys(session!).sort(), ["adminUserId", "email", "exp", "role"]);
    assert.equal(session?.role, "event_staff");
    assert.equal(session?.adminUserId, staff.id);
    assert.equal(token.includes(password), false);
    assert.equal(token.includes(staff.passwordHash), false);

    await testPrisma.adminUser.update({ where: { id: staff.id }, data: { isActive: false } });
    assert.equal(await authenticateAdmin(staff.email, password), null);
    await testPrisma.adminUser.update({ where: { id: staff.id }, data: { isActive: true, role: "viewer" } });
    assert.equal(await authenticateAdmin(staff.email, password), null);

    const legacy = await authenticateAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    assert.deepEqual(legacy, {
      email: process.env.ADMIN_EMAIL,
      role: "super_admin",
      adminUserId: null,
    });
  } finally {
    if (previous.jwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous.jwt;
    if (previous.email === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous.email;
    if (previous.password === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previous.password;
  }
});

test("janela de vendas bloqueia antes, abre exatamente no inicio e encerra no limite", async () => {
  const start = new Date("2026-08-01T15:00:00.000Z");
  const end = new Date("2026-08-01T17:00:00.000Z");
  const event = await createTestTicketEvent({ salesStartAt: start, salesEndAt: end });
  const lot = await createTestTicketLot(event.id, { salesStartAt: start, salesEndAt: end, price: new Prisma.Decimal("2.00") });
  const input = {
    eventId: event.id,
    idempotencyKey: "window-boundary-test-key",
    buyer: buyer(),
    participants: [participant()],
  };

  await assert.rejects(() => createEventOrderReservation({ ...input, now: new Date(start.getTime() - 1000) }), EventSalesNotStartedError);
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
  assert.equal((await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } })).reservedQuantity, 0);

  const reservation = await createEventOrderReservation({ ...input, now: start });
  assert.equal(reservation.total.toString(), "2");
  assert.equal((await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } })).reservedQuantity, 1);

  await assert.rejects(
    () => createEventOrderReservation({ ...input, idempotencyKey: "window-end-test-key", now: end }),
    EventSalesEndedError,
  );
  await assert.rejects(
    () => createEventOrderReservation({ ...input, idempotencyKey: "window-after-test-key", now: new Date(end.getTime() + 1000) }),
    EventSalesEndedError,
  );
});

test("POST direto antes da abertura nao cria pedido, participantes, reservas ou preferencia", async () => {
  const start = new Date(Date.now() + 60_000);
  const event = await createTestTicketEvent({ salesStartAt: start });
  const lot = await createTestTicketLot(event.id, { salesStartAt: start });
  const code = await createTestPartnerCode(event.id);
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "configured-for-integration-test";
  try {
    const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
      body: JSON.stringify({
        eventSlug: event.slug,
        buyer: buyer(),
        participants: [participant()],
        partnerCode: code.code,
        idempotencyKey: "direct-presale-post-key",
      }),
    }));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "EVENT_SALES_NOT_STARTED");
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
  assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
  assert.equal(await testPrisma.eventOrderParticipant.count({ where: { eventOrder: { eventId: event.id } } }), 0);
  assert.equal((await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } })).reservedQuantity, 0);
  assert.equal((await testPrisma.eventPartnerCode.findUniqueOrThrow({ where: { id: code.id } })).reservedUses, 0);
});

test("checkout HTTP com participante somente com name e cpf chega ao servico de reserva", async () => {
  const { event } = await createEventWithLot(5);
  const mock = installPreferenceFetchMock({});
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "configured-for-integration-test";
  try {
    const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.11" },
      body: JSON.stringify({
        eventSlug: event.slug,
        buyer: buyer(),
        participants: [{ name: participant().name, cpf: participant().cpf }],
        idempotencyKey: "minimal-participant-checkout-key",
      }),
    }));

    assert.equal(response.status, 201);
    assert.equal(mock.calls.create, 1);
    assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 1);
    assert.equal(await testPrisma.eventOrderParticipant.count({ where: { eventOrder: { eventId: event.id } } }), 1);
  } finally {
    mock.restore();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("checkout HTTP normaliza strings vazias somente nos campos opcionais conhecidos", async () => {
  const { event } = await createEventWithLot(5);
  const mock = installPreferenceFetchMock({});
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "configured-for-integration-test";
  try {
    const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.12" },
      body: JSON.stringify({
        eventSlug: event.slug,
        buyer: buyer(),
        participants: [{
          name: participant().name,
          cpf: participant().cpf,
          email: "",
          phone: "",
          birthDate: "",
          institution: "",
          course: "",
          campus: "",
        }],
        idempotencyKey: "empty-optionals-checkout-key",
      }),
    }));

    assert.equal(response.status, 201);
    assert.equal(mock.calls.create, 1);
    const saved = await testPrisma.eventOrderParticipant.findFirstOrThrow({
      where: { eventOrder: { eventId: event.id } },
    });
    assert.equal(saved.email, null);
    assert.equal(saved.birthDate, null);
    assert.equal(saved.institution, null);
  } finally {
    mock.restore();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("checkout HTTP rejeita opcionais vazios exigidos pelo evento sem criar reserva", async () => {
  const scenarios = [
    { field: "institution", event: { requireInstitution: true } },
    { field: "birthDate", event: { requireBirthDate: true } },
  ] as const;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "configured-for-integration-test";
  try {
    for (const [index, scenario] of scenarios.entries()) {
      const event = await createTestTicketEvent(scenario.event);
      const lot = await createTestTicketLot(event.id);
      const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${13 + index}` },
        body: JSON.stringify({
          eventSlug: event.slug,
          buyer: buyer(index),
          participants: [{
            name: participant(index).name,
            cpf: participant(index).cpf,
            [scenario.field]: "",
          }],
          idempotencyKey: `required-empty-${scenario.field}-key`,
        }),
      }));

      assert.equal(response.status, 400, scenario.field);
      const body = await response.json();
      assert.equal(body.code, "INVALID_PARTICIPANT_DATA", scenario.field);
      assert.equal(body.field, `participants.0.${scenario.field}`, scenario.field);
      assert.equal(body.participantIndex, 0, scenario.field);
      assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
      assert.equal((await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } })).reservedQuantity, 0);
    }
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
});

test("checkout HTTP mapeia CPF, e-mail e nascimento invalidos no segundo participante", async () => {
  const scenarios = [
    { field: "cpf", value: "12345678901", message: /CPF do Participante 2 é inválido/ },
    { field: "email", value: "email-invalido", message: /e-mail do Participante 2 é inválido/ },
    { field: "birthDate", value: "2026-02-31", message: /data de nascimento válida.*Participante 2/ },
  ] as const;

  for (const [index, scenario] of scenarios.entries()) {
    const event = await createTestTicketEvent({ maxTicketsPerOrder: 2 });
    const lot = await createTestTicketLot(event.id, { ticketsPerUnit: 2, maxUnitsPerOrder: 1 });
    const secondParticipant = { ...participant(index + 1), [scenario.field]: scenario.value };
    const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${220 + index}` },
      body: JSON.stringify({
        eventSlug: event.slug,
        ticketLotId: lot.id,
        commercialUnitQuantity: 1,
        buyer: buyer(index),
        participants: [participant(index), secondParticipant],
        idempotencyKey: `invalid-second-participant-${scenario.field}`,
      }),
    }));

    assert.equal(response.status, 400, scenario.field);
    const body = await response.json();
    assert.equal(body.code, "INVALID_PARTICIPANT_DATA", scenario.field);
    assert.equal(body.field, `participants.1.${scenario.field}`, scenario.field);
    assert.equal(body.participantIndex, 1, scenario.field);
    assert.match(body.message, scenario.message, scenario.field);
    assert.equal(await testPrisma.eventOrder.count({ where: { eventId: event.id } }), 0);
  }
});

test("checkout HTTP rejeita campos de preco, pagamento e IDs controlados pelo cliente", async () => {
  const forbiddenFields = {
    price: 0.01,
    unitPrice: -1,
    subtotal: 0,
    discountAmount: 999,
    total: 0.01,
    lotId: "lot-arbitrario",
    preferenceId: "pref-arbitraria",
    mercadoPagoPreferenceId: "pref-arbitraria",
    externalReference: "event_order:arbitraria",
    paymentId: "payment-arbitrario",
    paymentStatus: "approved",
  };
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "configured-for-integration-test";
  try {
    let index = 0;
    for (const [field, value] of Object.entries(forbiddenFields)) {
      index += 1;
      const response = await eventCheckoutPost(new Request("https://staging.example/api/eventos/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${20 + index}` },
        body: JSON.stringify({
          eventSlug: "qualquer-evento",
          buyer: buyer(),
          participants: [participant()],
          idempotencyKey: `strict-payload-${field}-000000`,
          [field]: value,
        }),
      }));
      assert.equal(response.status, 400, field);
    }
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
  assert.equal(await testPrisma.eventOrder.count(), 0);
});

test("proximo lancamento retorna o evento futuro mais proximo e ignora cancelado ou aberto", async () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const nearest = await createTestTicketEvent({ slug: "upcoming-nearest", salesStartAt: new Date(now.getTime() + 60_000) });
  await createTestTicketLot(nearest.id, { salesStartAt: new Date(now.getTime() + 60_000), salesEndAt: new Date(now.getTime() + 3_600_000) });
  const later = await createTestTicketEvent({ slug: "upcoming-later", salesStartAt: new Date(now.getTime() + 120_000) });
  await createTestTicketLot(later.id, { salesStartAt: new Date(now.getTime() + 120_000), salesEndAt: new Date(now.getTime() + 3_600_000) });
  const canceled = await createTestTicketEvent({ status: "CANCELED", salesStartAt: new Date(now.getTime() + 30_000) });
  await createTestTicketLot(canceled.id);
  const open = await createTestTicketEvent({ salesStartAt: new Date(now.getTime() - 1000) });
  await createTestTicketLot(open.id);

  assert.equal((await getUpcomingTicketSale(now))?.id, nearest.id);
});

test("acesso seguro por accessToken mostra um ticket pago", async () => {
  const { order } = await createPaidOrderFixture(1);
  const view = await getEventTicketsByAccessToken(order.accessToken);

  assert.ok(view);
  assert.equal(eventOrderTicketsReady(view), true);
  assert.equal(view.tickets.length, 1);
  assert.equal(view.tickets[0].participantName, participant(0).name);
});

test("acesso seguro por accessToken mostra multiplos tickets individuais", async () => {
  const { order } = await createPaidOrderFixture(3);
  const view = await getEventTicketsByAccessToken(order.accessToken);

  assert.ok(view);
  assert.equal(eventOrderTicketsReady(view), true);
  assert.equal(view.tickets.length, 3);
  assert.equal(new Set(view.tickets.map((ticket) => ticket.qrToken)).size, 3);
  assert.equal(new Set(view.tickets.map((ticket) => ticket.ticketCode)).size, 3);
});

test("pedido pendente e accessToken invalido nao expoem tickets", async () => {
  const { event } = await createEventWithLot(2);
  const pending = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "pending-ticket-access",
    quantity: 1,
  });

  const pendingView = await getEventTicketsByAccessToken(pending.accessToken);
  const missingView = await getEventTicketsByAccessToken("access-token-inexistente");

  assert.ok(pendingView);
  assert.equal(eventOrderTicketsReady(pendingView), false);
  assert.equal(pendingView.tickets.length, 0);
  assert.equal(missingView, null);
});

test("check-in reflete USED sem alterar qrToken nem ticketCode", async () => {
  const { event, order } = await createPaidOrderFixture(1);
  const admin = await createTestAdminUser();
  const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });

  await confirmEventTicketCheckIn({
    eventId: event.id,
    qrToken: ticket.qrToken,
    adminUserId: admin.id,
    source: "QR",
  });

  const view = await getEventTicketsByAccessToken(order.accessToken);
  assert.ok(view);
  assert.equal(view.tickets[0].status, "USED");
  assert.ok(view.tickets[0].checkedInAt);
  assert.equal(view.tickets[0].qrToken, ticket.qrToken);
  assert.equal(view.tickets[0].ticketCode, ticket.ticketCode);
});

test("email de ingressos nao envia para pedido pendente", async () => {
  const { event } = await createEventWithLot(1);
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "pending-email",
    quantity: 1,
  });
  const sent: unknown[] = [];

  const result = await ensureEventTicketConfirmationEmail(order.orderId, {
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender: { sendMail: async (message) => { sent.push(message); } },
  });

  assert.equal(result.reason, "not_ready");
  assert.equal(sent.length, 0);
});

test("email de ingressos aprovado envia exatamente uma vez e usa accessToken", async () => {
  const { order } = await createPaidOrderFixture(2);
  const sent: Array<{ text: string; html: string }> = [];
  const sender = {
    sendMail: async (message: { text: string; html: string }) => {
      sent.push(message);
    },
  };

  const first = await ensureEventTicketConfirmationEmail(order.orderId, {
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender,
  });
  const second = await ensureEventTicketConfirmationEmail(order.orderId, {
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender,
  });

  assert.equal(first.sent, true);
  assert.equal(second.reason, "already_sent");
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, new RegExp(`/meus-ingressos/${order.accessToken}`));
  assert.match(sent[0].html, new RegExp(`/meus-ingressos/${order.accessToken}`));
  for (const forbidden of [participant(0).cpf, "tk_", "paymentId"]) {
    assert.equal(sent[0].text.includes(forbidden), false);
    assert.equal(sent[0].html.includes(forbidden), false);
  }

  const updated = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
  assert.equal(updated.ticketConfirmationEmailStatus, "SENT");
  assert.ok(updated.ticketConfirmationEmailSentAt);
});

test("email de ingressos concorrente chama SMTP exatamente uma vez", async () => {
  const { order } = await createPaidOrderFixture(1);
  let sendCount = 0;
  const sender = {
    sendMail: async () => {
      sendCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
    },
  };

  const results = await Promise.allSettled([
    ensureEventTicketConfirmationEmail(order.orderId, {
      from: "eventos@aaau.test",
      baseUrl: "https://aaau.test",
      sender,
    }),
    ensureEventTicketConfirmationEmail(order.orderId, {
      from: "eventos@aaau.test",
      baseUrl: "https://aaau.test",
      sender,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  assert.equal(sendCount, 1);
  const updated = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
  assert.equal(updated.ticketConfirmationEmailStatus, "SENT");
  assert.ok(updated.ticketConfirmationEmailSentAt);
});

test("email SENDING recente nao envia novamente e SENDING abandonado vira AMBIGUOUS", async () => {
  const { order } = await createPaidOrderFixture(1);
  const now = new Date();
  const sent: unknown[] = [];

  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: {
      ticketConfirmationEmailStatus: "SENDING",
      ticketConfirmationEmailStartedAt: now,
    },
  });

  const recent = await ensureEventTicketConfirmationEmail(order.orderId, {
    now,
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender: { sendMail: async (message) => { sent.push(message); } },
  });
  assert.equal(recent.reason, "sending_recent");
  assert.equal(sent.length, 0);

  const oldStartedAt = new Date(now.getTime() - EVENT_TICKET_EMAIL_SENDING_LEASE_MS - 1_000);
  await testPrisma.eventOrder.update({
    where: { id: order.orderId },
    data: { ticketConfirmationEmailStartedAt: oldStartedAt },
  });

  const abandoned = await ensureEventTicketConfirmationEmail(order.orderId, {
    now,
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender: { sendMail: async (message) => { sent.push(message); } },
  });
  const updated = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });

  assert.equal(abandoned.reason, "sending_ambiguous");
  assert.equal(sent.length, 0);
  assert.equal(updated.ticketConfirmationEmailStatus, "AMBIGUOUS");
});

test("falha SMTP nao altera pagamento tickets ou contadores", async () => {
  const { lot, order } = await createPaidOrderFixture(1);

  const result = await ensureEventTicketConfirmationEmail(order.orderId, {
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender: { sendMail: async () => { throw new Error("smtp down"); } },
  });

  const updatedOrder = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
  const updatedLot = await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } });
  const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId } });

  assert.equal(result.reason, "smtp_failed");
  assert.equal(updatedOrder.status, "PAID");
  assert.equal(updatedOrder.ticketConfirmationEmailStatus, "NOT_SENT");
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].status, "VALID");
  assert.equal(updatedLot.soldQuantity, 1);
});

test("SMTP ambiguo marca AMBIGUOUS e nova chamada nao reenvia", async () => {
  const { order } = await createPaidOrderFixture(1);
  let sendCount = 0;

  const first = await ensureEventTicketConfirmationEmail(order.orderId, {
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender: {
      sendMail: async () => {
        sendCount += 1;
        throw new AmbiguousEventTicketEmailError();
      },
    },
  });
  const second = await ensureEventTicketConfirmationEmail(order.orderId, {
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
    sender: {
      sendMail: async () => {
        sendCount += 1;
      },
    },
  });
  const updated = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });

  assert.equal(first.reason, "smtp_ambiguous");
  assert.equal(second.reason, "ambiguous");
  assert.equal(sendCount, 1);
  assert.equal(updated.ticketConfirmationEmailStatus, "AMBIGUOUS");
});

test("admin cria evento draft, bloqueia publicacao sem lote e publica com lote futuro", async () => {
  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Admin Publicacao" }), superAdminActor);
  assert.equal(event.published, false);
  assert.equal(event.status, "DRAFT");

  await assert.rejects(() => publishTicketEventAdmin(event.id, superAdminActor), EventAdminValidationError);

  await createTicketLotAdmin(event.id, adminLotInput(), superAdminActor);
  const published = await publishTicketEventAdmin(event.id, superAdminActor);
  assert.equal(published.published, true);

  const publicEvent = await testPrisma.ticketEvent.findFirst({ where: { id: event.id, published: true } });
  assert.ok(publicEvent);

  const logs = await testPrisma.eventAdminAuditLog.findMany({ where: { eventId: event.id } });
  assert.ok(logs.some((log) => log.action === "EVENT_CREATED"));
  assert.ok(logs.some((log) => log.action === "LOT_CREATED"));
  assert.ok(logs.some((log) => log.action === "EVENT_PUBLISHED"));
});

test("admin despublica evento e helper publico deixa de listar", async () => {
  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Admin Despublicar" }), superAdminActor);
  await createTicketLotAdmin(event.id, adminLotInput(), superAdminActor);
  await publishTicketEventAdmin(event.id, superAdminActor);
  await unpublishTicketEventAdmin(event.id, superAdminActor);

  const updated = await testPrisma.ticketEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(updated.published, false);
  assert.equal(updated.status, "DRAFT");
});

test("admin valida datas invalidas e lote gratuito", async () => {
  await assert.rejects(
    () => createTicketEventAdmin(adminEventInput({
      minimumAge: 18,
      requireBirthDate: false,
    }), superAdminActor),
    EventAdminValidationError,
  );

  await assert.rejects(
    () => createTicketEventAdmin(adminEventInput({
      startAt: new Date("2026-01-02T00:00:00.000Z"),
      endAt: new Date("2026-01-01T00:00:00.000Z"),
    }), superAdminActor),
    EventAdminValidationError,
  );

  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Admin Lote Gratis" }), superAdminActor);
  await assert.rejects(
    () => createTicketLotAdmin(event.id, adminLotInput({ price: new Prisma.Decimal("0.00") }), superAdminActor),
    EventAdminValidationError,
  );
});

test("admin protege reducao de quantidade abaixo de sold + reserved e permite aumento", async () => {
  const { event, lot, order } = await createPaidOrderFixture(2);
  await assert.rejects(
    () => updateTicketLotAdmin(lot.id, adminLotInput({ quantity: 1, position: lot.position }), superAdminActor),
    EventAdminValidationError,
  );

  const updated = await updateTicketLotAdmin(
    lot.id,
    adminLotInput({ quantity: 20, position: lot.position, price: new Prisma.Decimal("60.00") }),
    superAdminActor,
  );
  assert.equal(updated.quantity, 20);
  assert.equal(updated.price.toString(), "60");

  const existingOrder = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
  assert.equal(existingOrder.total.toString(), "100");
  assert.equal(existingOrder.eventId, event.id);
});

test("admin cria e atualiza partner code normalizado sem alterar contadores", async () => {
  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Admin Codigo" }), superAdminActor);
  const code = await createPartnerCodeAdmin(event.id, {
    code: " ufrgs10 ",
    partnerName: "UFRGS",
    partnerType: "ATHLETIC",
    discountType: "PERCENTAGE",
    discountValue: new Prisma.Decimal("10"),
    maxUses: 10,
    startsAt: null,
    expiresAt: null,
    active: true,
  }, superAdminActor);
  assert.equal(code.code, "UFRGS10");

  await testPrisma.eventPartnerCode.update({ where: { id: code.id }, data: { reservedUses: 1, confirmedUses: 2 } });
  const updated = await updatePartnerCodeAdmin(code.id, {
    code: "ufrgs10",
    partnerName: "UFRGS Atualizada",
    partnerType: "ATHLETIC",
    discountType: "FIXED",
    discountValue: new Prisma.Decimal("5"),
    maxUses: 20,
    startsAt: null,
    expiresAt: null,
    active: false,
  }, superAdminActor);
  assert.equal(updated.reservedUses, 1);
  assert.equal(updated.confirmedUses, 2);
  assert.equal(updated.active, false);
});

test("admin bloqueia partner percentage maior que 100 e fixed menor ou igual a zero", async () => {
  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Admin Codigo Invalido" }), superAdminActor);
  await assert.rejects(
    () => createPartnerCodeAdmin(event.id, {
      code: "BAD",
      partnerName: "Bad",
      partnerType: "PARTNER",
      discountType: "PERCENTAGE",
      discountValue: new Prisma.Decimal("101"),
      maxUses: null,
      startsAt: null,
      expiresAt: null,
      active: true,
    }, superAdminActor),
    EventAdminValidationError,
  );
  await assert.rejects(
    () => createPartnerCodeAdmin(event.id, {
      code: "BAD2",
      partnerName: "Bad",
      partnerType: "PARTNER",
      discountType: "FIXED",
      discountValue: new Prisma.Decimal("0"),
      maxUses: null,
      startsAt: null,
      expiresAt: null,
      active: true,
    }, superAdminActor),
    EventAdminValidationError,
  );
});

test("admin metricas usam somente PAID e DTOs nao expoem tokens sensiveis", async () => {
  const { event } = await createEventWithLot(3);
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: "admin-paid-order",
    quantity: 1,
  });
  await confirmEventOrderPayment({
    eventOrderId: order.orderId,
    paymentId: `PAY-${event.id}`,
    paidAmount: order.total,
  });
  await reserveOrder({ eventId: event.id, idempotencyKey: "admin-pending-order", quantity: 1, participantOffset: 1 });
  const [overview, orders, tickets] = await Promise.all([
    getAdminEventCockpit(event.id, "geral"),
    getAdminEventCockpit(event.id, "pedidos"),
    getAdminEventCockpit(event.id, "ingressos"),
  ]);
  assert.ok(overview);
  assert.ok(orders);
  assert.ok(tickets);
  assert.equal(overview.kpis.paidOrdersCount, 1);
  assert.equal(overview.kpis.confirmedRevenue.toString(), order.total.toString());
  assert.equal(orders.orders.length, 2);
  assert.equal(tickets.tickets.length, 1);
  assert.equal(orders.orders.some((adminOrder) => "accessToken" in adminOrder), false);
  assert.equal(tickets.tickets.some((ticket) => "qrToken" in ticket), false);
});

test("admin reenvio bloqueia pending e permite PAID/AMBIGUOUS com confirmacao", async () => {
  const { event } = await createEventWithLot(2);
  const pending = await reserveOrder({ eventId: event.id, idempotencyKey: "admin-email-pending", quantity: 1 });
  await assert.rejects(
    () => resendTicketConfirmationEmailAdmin({
      eventOrderId: pending.orderId,
      actor: superAdminActor,
      sender: { sendMail: async () => undefined },
      from: "eventos@aaau.test",
      baseUrl: "https://aaau.test",
    }),
    EventAdminValidationError,
  );

  const paid = await createPaidOrderFixture(1);
  const sent: unknown[] = [];
  const result = await resendTicketConfirmationEmailAdmin({
    eventOrderId: paid.order.orderId,
    actor: superAdminActor,
    sender: { sendMail: async (message) => { sent.push(message); } },
    from: "eventos@aaau.test",
    baseUrl: "https://aaau.test",
  });
  assert.equal(result.sent, true);
  assert.equal(sent.length, 1);

  await testPrisma.eventOrder.update({
    where: { id: paid.order.orderId },
    data: { ticketConfirmationEmailStatus: "AMBIGUOUS", ticketConfirmationEmailSentAt: null },
  });
  await assert.rejects(
    () => resendTicketConfirmationEmailAdmin({
      eventOrderId: paid.order.orderId,
      actor: superAdminActor,
      sender: { sendMail: async () => undefined },
      from: "eventos@aaau.test",
      baseUrl: "https://aaau.test",
    }),
    EventAdminValidationError,
  );
});

test("admin RBAC bloqueia event_staff em servicos sensiveis", async () => {
  await assert.rejects(
    () => createTicketEventAdmin(adminEventInput({ name: "AU Staff Block" }), eventStaffActor),
    EventAdminForbiddenError,
  );
  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Staff Lot Block" }), superAdminActor);
  await assert.rejects(
    () => createTicketLotAdmin(event.id, adminLotInput(), eventStaffActor),
    EventAdminForbiddenError,
  );
  await assert.rejects(
    () => createPartnerCodeAdmin(event.id, {
      code: "STAFF",
      partnerName: "Staff",
      partnerType: "PARTNER",
      discountType: "PERCENTAGE",
      discountValue: new Prisma.Decimal("10"),
      maxUses: null,
      startsAt: null,
      expiresAt: null,
      active: true,
    }, eventStaffActor),
    EventAdminForbiddenError,
  );
});

test("admin cancelamento bloqueia novas vendas publicamente sem apagar historico", async () => {
  const event = await createTicketEventAdmin(adminEventInput({ name: "AU Admin Cancelar" }), superAdminActor);
  await createTicketLotAdmin(event.id, adminLotInput({ salesStartAt: new Date(Date.now() - 60_000) }), superAdminActor);
  await publishTicketEventAdmin(event.id, superAdminActor);
  await cancelTicketEventAdmin(event.id, superAdminActor);

  const dashboard = await getAdminEventsDashboard();
  const listed = dashboard.events.find((item) => item.id === event.id);
  assert.equal(listed?.adminStatus, "CANCELED");
  assert.equal(listed?.publicStatus, "Cancelado");
});

test("admin configura pacote promocional generico e protege multiplicador depois de reserva", async () => {
  const event = await createTestTicketEvent({
    maxTicketsPerOrder: 4,
    salesStartAt: new Date("2026-08-01T00:00:00-03:00"),
    salesEndAt: new Date("2026-08-10T00:00:00-03:00"),
  });
  const promotion = await createTicketLotAdmin(event.id, adminLotInput({
    name: "Lote Promocional - 2 por 1",
    price: new Prisma.Decimal("130.00"),
    quantity: 100,
    ticketsPerUnit: 2,
    maxUnitsPerOrder: 2,
    exclusiveWindow: true,
    salesStartAt: PROMO_START,
    salesEndAt: PROMO_END,
  }), superAdminActor);
  assert.equal(promotion.ticketsPerUnit, 2);
  assert.equal(promotion.maxUnitsPerOrder, 2);
  assert.equal(promotion.exclusiveWindow, true);
  assert.equal(promotion.salesStartAt?.toISOString(), "2026-08-07T15:00:00.000Z");
  assert.equal(promotion.salesEndAt?.toISOString(), "2026-08-08T15:00:00.000Z");

  await reserveOrder({
    eventId: event.id,
    idempotencyKey: "admin-promo-reservation",
    ticketLotId: promotion.id,
    commercialUnitQuantity: 1,
    participantCount: 2,
    now: PROMO_NOW,
  });
  await assert.rejects(() => updateTicketLotAdmin(promotion.id, adminLotInput({
    name: promotion.name,
    position: promotion.position,
    quantity: 100,
    price: promotion.price,
    ticketsPerUnit: 1,
    maxUnitsPerOrder: 2,
    exclusiveWindow: true,
    salesStartAt: PROMO_START,
    salesEndAt: PROMO_END,
  }), superAdminActor), EventAdminValidationError);
});

function tokenFromOutboxPayload(payload: { text: string }, segment: "confirmar" | "aceitar") {
  const match = payload.text.match(new RegExp(`/transferencia-ingresso/${segment}/([A-Za-z0-9_-]+)`));
  assert.ok(match);
  return match[1];
}

test("fase 3 transfere somente um de tres ingressos e recupera falha de email pela outbox", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    const target = tickets[1];
    const siblings = [tickets[0], tickets[2]];
    const request = await requestEventTicketTransfer({
      ticketId: target.id,
      holderCredential: { kind: "ORIGINAL_ORDER", orderAccessToken: order.accessToken },
      recipientEmail: transferRecipient.email,
    });
    assert.equal(request.created, true);
    assert.ok(request.rawConfirmationToken);
    const requestReplay = await requestEventTicketTransfer({
      ticketId: target.id,
      holderCredential: { kind: "ORIGINAL_ORDER", orderAccessToken: order.accessToken },
      recipientEmail: transferRecipient.email.toUpperCase(),
    });
    assert.equal(requestReplay.created, false);
    assert.equal(requestReplay.transferId, request.transferId);
    assert.equal(requestReplay.rawConfirmationToken, null);

    const confirmationOutbox = await testPrisma.eventTicketTransferOutbox.findFirstOrThrow({ where: { transferId: request.transferId } });
    const persistedBeforeConfirmation = JSON.stringify(confirmationOutbox);
    assert.equal(persistedBeforeConfirmation.includes(request.rawConfirmationToken!), false);
    const beforeGet = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: request.transferId } });
    assert.equal((await getHolderConfirmationView(request.rawConfirmationToken!)).state, "READY");
    assert.deepEqual(await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: request.transferId } }), beforeGet);

    const firstDeliveries: string[] = [];
    await processEventTicketTransferOutbox({ sender: async (mail) => { firstDeliveries.push(mail.kind); } });
    assert.deepEqual(firstDeliveries, ["EVENT_TICKET_TRANSFER_HOLDER_CONFIRMATION"]);
    await confirmEventTicketTransfer(request.rawConfirmationToken!);
    await confirmEventTicketTransfer(request.rawConfirmationToken!);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: request.transferId, kind: "EVENT_TICKET_TRANSFER_RECIPIENT_INVITATION" } }), 1);
    const invitation = await testPrisma.eventTicketTransferOutbox.findFirstOrThrow({ where: { transferId: request.transferId, kind: "EVENT_TICKET_TRANSFER_RECIPIENT_INVITATION" } });
    assert.ok(invitation.encryptedPayload && invitation.initializationVector && invitation.authenticationTag);
    const invitationPayload = decryptTransferEmailPayload({
      encryptedPayload: invitation.encryptedPayload,
      initializationVector: invitation.initializationVector,
      authenticationTag: invitation.authenticationTag,
    });
    const acceptanceToken = tokenFromOutboxPayload(invitationPayload, "aceitar");
    assert.equal(JSON.stringify(invitation).includes(acceptanceToken), false);
    assert.equal((await getRecipientAcceptanceView(acceptanceToken)).state, "READY");
    await processEventTicketTransferOutbox({ sender: async () => undefined });

    const completed = await acceptEventTicketTransfer(acceptanceToken, {
      name: transferRecipient.name,
      cpf: transferRecipient.cpf,
      phone: transferRecipient.phone,
    });
    assert.ok(completed.rawAccessToken);
    const targetAfter = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: target.id } });
    assert.notEqual(targetAfter.qrToken, target.qrToken);
    assert.notEqual(targetAfter.ticketCode, target.ticketCode);
    for (const sibling of siblings) {
      assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: sibling.id } }), sibling);
    }

    const countsBeforeRetry = {
      grants: await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: target.id } }),
      qrVersions: await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }),
      portalSessions: await testPrisma.eventTicketPortalSession.count(),
    };
    assert.equal(completed.outboxIds.length, 2);
    const failed = await processEventTicketTransferOutbox({ sender: async () => { throw new Error(`secret ${completed.rawAccessToken}`); } });
    assert.equal(failed.failed, 2);
    const failedRows = await testPrisma.eventTicketTransferOutbox.findMany({ where: { transferId: request.transferId, status: "FAILED" } });
    assert.equal(failedRows.length, 2);
    assert.ok(failedRows.every((row) => !row.lastError?.includes(completed.rawAccessToken!)));
    assert.ok(failedRows.every((row) => row.encryptedPayload && row.initializationVector && row.authenticationTag));
    assert.equal(JSON.stringify(failedRows).includes(completed.rawAccessToken!), false);
    const retried: string[] = [];
    const retry = await processEventTicketTransferOutbox({
      now: new Date(Date.now() + 2 * 60 * 60_000),
      sender: async (mail) => { retried.push(mail.kind); },
    });
    assert.equal(retry.sent, 2);
    assert.deepEqual({
      grants: await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: target.id } }),
      qrVersions: await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }),
      portalSessions: await testPrisma.eventTicketPortalSession.count(),
    }, countsBeforeRetry);
    const sentRows = await testPrisma.eventTicketTransferOutbox.findMany({ where: { transferId: request.transferId, status: "SENT" } });
    assert.equal(sentRows.length, 4);
    assert.ok(sentRows.every((row) => !row.encryptedPayload && !row.initializationVector && !row.authenticationTag));

    const collective = await getEventTicketsByAccessToken(order.accessToken);
    assert.ok(collective);
    const redacted = collective.tickets.find((ticket) => ticket.ticketId === target.id);
    assert.equal(redacted?.accessStatus, "TRANSFERRED");
    const collectiveJson = JSON.stringify(collective);
    assert.equal(collectiveJson.includes(targetAfter.qrToken), false);
    assert.equal(collectiveJson.includes(targetAfter.ticketCode), false);
    assert.equal(collectiveJson.includes(transferRecipient.name), false);
    assert.ok(siblings.every((sibling) => collective.tickets.some((ticket) => ticket.ticketId === sibling.id && ticket.accessStatus === "AVAILABLE" && ticket.qrToken === sibling.qrToken)));
    const individual = await getEventTicketsByAccessToken(completed.rawAccessToken!);
    assert.equal(individual?.accessKind, "INDIVIDUAL_GRANT");
    assert.equal(individual?.tickets.length, 1);
    assert.equal(individual?.tickets[0].ticketId, target.id);
    assert.equal(await getRecipientAcceptanceView(acceptanceToken).then((view) => view.state), "INVALID");
  } finally {
    restore();
  }
});

test("idade minima exige nascimento antes de rotacionar credenciais e permite nova tentativa valida", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { event, order } = await createPaidOrderFixture(1);
    await testPrisma.ticketEvent.update({
      where: { id: event.id },
      data: { minimumAge: 18, requireBirthDate: false },
    });
    const ticketBefore = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    await ensureInitialEventTicketQrVersion(ticketBefore.id, testPrisma);
    const activeBefore = await testPrisma.eventTicketQrVersion.findFirstOrThrow({
      where: { ticketId: ticketBefore.id, status: "ACTIVE" },
    });
    const request = await requestEventTicketTransfer({
      ticketId: ticketBefore.id,
      holderCredential: { kind: "ORIGINAL_ORDER", orderAccessToken: order.accessToken },
      recipientEmail: transferRecipient.email,
    });
    await confirmEventTicketTransfer(request.rawConfirmationToken!);
    const invitation = await testPrisma.eventTicketTransferOutbox.findFirstOrThrow({
      where: { transferId: request.transferId, kind: "EVENT_TICKET_TRANSFER_RECIPIENT_INVITATION" },
    });
    const acceptanceToken = tokenFromOutboxPayload(decryptTransferEmailPayload({
      encryptedPayload: invitation.encryptedPayload!,
      initializationVector: invitation.initializationVector!,
      authenticationTag: invitation.authenticationTag!,
    }), "aceitar");

    await assert.rejects(
      () => acceptEventTicketTransfer(acceptanceToken, transferRecipient),
      /EVENT_TICKET_TRANSFER_RECIPIENT_INVALID/,
    );
    const failedTransfer = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: request.transferId } });
    assert.equal(failedTransfer.status, "PENDING_RECIPIENT_ACCEPTANCE");
    assert.ok(failedTransfer.recipientConfirmedAt);
    assert.equal(failedTransfer.completedAt, null);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticketBefore.id } }), ticketBefore);
    assert.deepEqual(
      await testPrisma.eventTicketQrVersion.findFirstOrThrow({ where: { id: activeBefore.id } }),
      activeBefore,
    );
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: ticketBefore.id } }), 0);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({
      where: {
        transferId: request.transferId,
        kind: { in: ["EVENT_TICKET_TRANSFER_RECIPIENT_COMPLETED", "EVENT_TICKET_TRANSFER_PREVIOUS_HOLDER_COMPLETED"] },
      },
    }), 0);

    const completed = await acceptEventTicketTransfer(acceptanceToken, {
      ...transferRecipient,
      birthDate: "2000-01-02",
    });
    assert.equal(completed.alreadyCompleted, false);
    const ticketAfter = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticketBefore.id } });
    assert.equal(ticketAfter.ownershipVersion, ticketBefore.ownershipVersion + 1);
    assert.equal(ticketAfter.qrVersion, ticketBefore.qrVersion + 1);
    assert.notEqual(ticketAfter.qrToken, ticketBefore.qrToken);
    assert.notEqual(ticketAfter.ticketCode, ticketBefore.ticketCode);
    assert.equal((await testPrisma.eventTicketQrVersion.findUniqueOrThrow({ where: { id: activeBefore.id } })).status, "REVOKED");
    assert.equal(await testPrisma.eventTicketAccessGrant.count({
      where: { ticketId: ticketBefore.id, createdFromTransferId: request.transferId, revokedAt: null },
    }), 1);
  } finally {
    restore();
  }
});

test("fase 3 autoriza grant apenas para seu ingresso e cancelamento, rejeicao e expiracao preservam credenciais", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    const grant = await createIndividualEventTicketAccessGrant({ ticketId: tickets[0].id, ownershipVersion: 1, holderEmail: tickets[0].participantEmail!, db: testPrisma });
    await assert.rejects(() => requestEventTicketTransfer({
      ticketId: tickets[1].id,
      holderCredential: { kind: "INDIVIDUAL_GRANT", grantToken: grant.rawToken },
      recipientEmail: "destino@event-test.local",
    }), /EVENT_TICKET_TRANSFER_UNAUTHORIZED/);
    const request = await requestEventTicketTransfer({
      ticketId: tickets[0].id,
      holderCredential: { kind: "INDIVIDUAL_GRANT", grantToken: grant.rawToken },
      recipientEmail: "destino@event-test.local",
    });
    await cancelEventTicketTransfer(request.rawConfirmationToken!);
    const canceled = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: request.transferId } });
    assert.equal(canceled.status, "CANCELED");
    assert.ok(canceled.canceledAt);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[0].id } }), tickets[0]);

    const request2 = await requestEventTicketTransfer({
      ticketId: tickets[0].id,
      holderCredential: { kind: "INDIVIDUAL_GRANT", grantToken: grant.rawToken },
      recipientEmail: "destino2@event-test.local",
    });
    await confirmEventTicketTransfer(request2.rawConfirmationToken!);
    const invitation = await testPrisma.eventTicketTransferOutbox.findFirstOrThrow({ where: { transferId: request2.transferId, kind: "EVENT_TICKET_TRANSFER_RECIPIENT_INVITATION" } });
    const acceptanceToken = tokenFromOutboxPayload(decryptTransferEmailPayload({
      encryptedPayload: invitation.encryptedPayload!, initializationVector: invitation.initializationVector!, authenticationTag: invitation.authenticationTag!,
    }), "aceitar");
    await rejectEventTicketTransfer(acceptanceToken);
    const rejected = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: request2.transferId } });
    assert.equal(rejected.status, "REJECTED");
    assert.ok(rejected.rejectedAt);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[0].id } }), tickets[0]);

    const expiredAt = new Date("2026-08-05T12:00:00.000Z");
    const request3 = await requestEventTicketTransfer({
      ticketId: tickets[0].id,
      holderCredential: { kind: "INDIVIDUAL_GRANT", grantToken: grant.rawToken },
      recipientEmail: "destino3@event-test.local",
      now: expiredAt,
    });
    await assert.rejects(() => confirmEventTicketTransfer(request3.rawConfirmationToken!, new Date(expiredAt.getTime() + 31 * 60_000)), /EVENT_TICKET_TRANSFER_EXPIRED/);
    const expired = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: request3.transferId } });
    assert.equal(expired.status, "EXPIRED");
    assert.ok(expired.expiredAt);
    assert.equal(expired.currentHolderConfirmationTokenHash, null);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[0].id } }), tickets[0]);
    assert.equal((await testPrisma.eventTicketAccessGrant.findUniqueOrThrow({ where: { id: grant.grant.id } })).revokedAt, null);
  } finally {
    restore();
  }
});

test("fase 3 serializa solicitacoes concorrentes e respeita feature flag", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    const input = {
      ticketId: ticket.id,
      holderCredential: { kind: "ORIGINAL_ORDER" as const, orderAccessToken: order.accessToken },
      recipientEmail: "concorrente@event-test.local",
    };
    const results = await Promise.all([requestEventTicketTransfer(input), requestEventTicketTransfer(input)]);
    assert.equal(new Set(results.map((result) => result.transferId)).size, 1);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: ticket.id } }), 1);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: results[0].transferId } }), 1);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }), ticket);
    let sends = 0;
    await Promise.all([
      processEventTicketTransferOutbox({ sender: async () => { sends += 1; } }),
      processEventTicketTransferOutbox({ sender: async () => { sends += 1; } }),
    ]);
    assert.equal(sends, 1);

    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
    await assert.rejects(() => requestEventTicketTransfer({ ...input, recipientEmail: "outro@event-test.local" }), /EVENT_TICKET_TRANSFERS_DISABLED/);
  } finally {
    restore();
  }
});

test("fase 3 faz rollback da conclusao se nao puder persistir o email final cifrado", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    await ensureInitialEventTicketQrVersion(ticket.id, testPrisma);
    const transfer = await createReadyTransfer(ticket.id);
    delete process.env.EVENT_TICKET_TRANSFER_OUTBOX_SECRET;
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: ticket.id,
      expectedOwnershipVersion: ticket.ownershipVersion,
      recipient: transferRecipient,
      queueCompletionEmails: true,
    }), /OUTBOX_SECRET/);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: ticket.id } }), ticket);
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: ticket.id } }), 0);
    assert.deepEqual(
      (await testPrisma.eventTicketQrVersion.findMany({ where: { ticketId: ticket.id } })).map(({ version, status }) => ({ version, status })),
      [{ version: 1, status: "ACTIVE" }],
    );
    assert.equal((await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status, "PENDING_RECIPIENT_ACCEPTANCE");
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: transfer.id } }), 0);
  } finally {
    restore();
  }
});

test("fase 4 responde de forma neutra e envia magic link sem credenciais ou PII", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(1);
    const unknown = await requestEventTicketPortalAccess({
      email: "inexistente@event-test.local",
      ip: "198.51.100.10",
    });
    const participantOnly = await requestEventTicketPortalAccess({
      email: participant(0).email,
      ip: "198.51.100.13",
    });
    const known = await requestEventTicketPortalAccess({
      email: buyer(0).email.toUpperCase(),
      ip: "198.51.100.11",
    });
    assert.deepEqual({ accepted: unknown.accepted }, { accepted: known.accepted });
    assert.equal(unknown.created, false);
    assert.equal(participantOnly.created, false);
    assert.equal(known.created, true);
    assert.ok(known.rawMagicToken && known.sessionId);
    assert.equal(await testPrisma.eventTicketPortalSession.count(), 1);

    const session = await testPrisma.eventTicketPortalSession.findUniqueOrThrow({ where: { id: known.sessionId } });
    const outbox = await testPrisma.eventTicketPortalOutbox.findFirstOrThrow({ where: { portalSessionId: session.id } });
    const persisted = JSON.stringify({ session, outbox });
    assert.equal(persisted.includes(known.rawMagicToken!), false);
    assert.equal(session.magicLinkTokenHash, hashPortalMagicLinkToken(known.rawMagicToken!));
    assert.ok(outbox.encryptedPayload && outbox.initializationVector && outbox.authenticationTag);
    const payload = decryptPortalEmailPayload({
      encryptedPayload: outbox.encryptedPayload,
      initializationVector: outbox.initializationVector,
      authenticationTag: outbox.authenticationTag,
    });
    const emailBody = `${payload.text}\n${payload.html}`;
    assert.match(emailBody, /Acessar meus ingressos/i);
    assert.match(emailBody, new RegExp(known.rawMagicToken!));
    for (const secret of [order.accessToken, buyer(0).cpf, "QR Code", "código manual", "Participante Teste"]) {
      assert.equal(emailBody.includes(secret), false);
    }

    const cooldown = await requestEventTicketPortalAccess({ email: buyer(0).email, ip: "198.51.100.12" });
    assert.equal(cooldown.created, false);
    let sends = 0;
    await Promise.all([
      processEventTicketPortalOutbox({ sender: async () => { sends += 1; } }),
      processEventTicketPortalOutbox({ sender: async () => { sends += 1; } }),
    ]);
    assert.equal(sends, 1);
    assert.equal((await testPrisma.eventTicketPortalOutbox.findUniqueOrThrow({ where: { id: outbox.id } })).encryptedPayload, null);
  } finally {
    restore();
  }
});

test("fase 4 usa magic link uma vez, troca por cookie sem token na URL e revoga a sessao", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    await createPaidOrderFixture(1);
    const issued = await requestEventTicketPortalAccess({ email: buyer(0).email, ip: "198.51.100.20" });
    assert.ok(issued.rawMagicToken);
    assert.equal(await exchangeEventTicketPortalMagicLink({ rawMagicToken: "token-invalido", ip: "198.51.100.21" }), null);
    const exchanged = await exchangeEventTicketPortalMagicLink({ rawMagicToken: issued.rawMagicToken!, ip: "198.51.100.20" });
    assert.ok(exchanged);
    assert.notEqual(exchanged.rawSessionToken, issued.rawMagicToken);
    assert.equal(await exchangeEventTicketPortalMagicLink({ rawMagicToken: issued.rawMagicToken!, ip: "198.51.100.20" }), null);
    const resolved = await resolveEventTicketPortalSession(exchanged.rawSessionToken);
    assert.equal(resolved?.id, issued.sessionId);
    const stored = await testPrisma.eventTicketPortalSession.findUniqueOrThrow({ where: { id: issued.sessionId } });
    assert.equal(stored.magicLinkTokenHash, null);
    assert.equal(stored.sessionTokenHash, hashPortalSessionToken(exchanged.rawSessionToken));

    await revokeEventTicketPortalSession(exchanged.rawSessionToken);
    assert.equal(await resolveEventTicketPortalSession(exchanged.rawSessionToken), null);

    const base = new Date();
    const routeLink = await requestEventTicketPortalAccess({
      email: buyer(0).email,
      ip: "198.51.100.22",
      now: new Date(base.getTime() + 6 * 60_000),
    });
    assert.ok(routeLink.rawMagicToken);
    const response = await portalAccessGet(
      new Request(`https://aaau.test/meus-ingressos/acesso/${routeLink.rawMagicToken}`, {
        headers: { "x-forwarded-for": "198.51.100.22" },
      }),
      { params: Promise.resolve({ token: routeLink.rawMagicToken! }) },
    );
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://aaau.test/meus-ingressos/painel");
    assert.equal(response.headers.get("location")?.includes(routeLink.rawMagicToken!), false);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /aaau_ticket_portal_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\/meus-ingressos/i);

    const expired = await requestEventTicketPortalAccess({
      email: buyer(0).email,
      ip: "198.51.100.23",
      now: new Date(base.getTime() + 12 * 60_000),
    });
    assert.ok(expired.rawMagicToken);
    assert.equal(await exchangeEventTicketPortalMagicLink({
      rawMagicToken: expired.rawMagicToken!,
      ip: "198.51.100.23",
      now: new Date(base.getTime() + 73 * 60_000),
    }), null);
  } finally {
    restore();
  }
});

test("fase 4 redige somente o ingresso transferido de um pedido com tres ingressos", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { lot, order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
      orderBy: { participantName: "asc" },
    });
    const target = tickets[1];
    const siblingsBefore = [tickets[0], tickets[2]];
    const orderBefore = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });
    const lotBefore = await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } });
    await ensureInitialEventTicketQrVersion(target.id, testPrisma);
    const transfer = await createReadyTransfer(target.id);
    await completeEventTicketTransfer({
      transferId: transfer.id,
      ticketId: target.id,
      expectedOwnershipVersion: target.ownershipVersion,
      recipient: transferRecipient,
    });

    const view = await getEventTicketPortalView({
      email: buyer(0).email,
      emailHash: hashPortalEmail(buyer(0).email),
    });
    const group = view.groups.find((candidate) => candidate.source === "ORIGINAL_ORDER");
    assert.ok(group);
    assert.equal(group.tickets.length, 3);
    const redacted = group.tickets.find((ticket) => ticket.ticketId === target.id);
    assert.deepEqual(redacted && { state: redacted.state, keys: Object.keys(redacted).sort() }, {
      state: "TRANSFERRED",
      keys: ["state", "ticketId", "transferredAt"],
    });
    const active = group.tickets.filter((ticket) => ticket.state === "ACTIVE");
    assert.equal(active.length, 2);
    assert.deepEqual(active.map((ticket) => ticket.ticketId).sort(), siblingsBefore.map((ticket) => ticket.id).sort());
    assert.ok(active.every((ticket) => "qrToken" in ticket && "ticketCode" in ticket && ticket.canTransfer));
    const serialized = JSON.stringify(view);
    for (const secret of [order.accessToken, transferRecipient.name, transferRecipient.email, transferRecipient.cpf, transferRecipient.phone]) {
      assert.equal(serialized.includes(secret), false);
    }
    assert.deepEqual(await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } }), orderBefore);
    assert.deepEqual(await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: lot.id } }), lotBefore);
    for (const sibling of siblingsBefore) {
      assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: sibling.id } }), sibling);
    }
  } finally {
    restore();
  }
});

test("fase 4 limita grant ao ingresso recebido e bloqueia segunda transferencia", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    const target = tickets[0];
    const sibling = tickets[1];
    await ensureInitialEventTicketQrVersion(target.id, testPrisma);
    const firstTransfer = await createReadyTransfer(target.id);
    await completeEventTicketTransfer({
      transferId: firstTransfer.id,
      ticketId: target.id,
      expectedOwnershipVersion: target.ownershipVersion,
      recipient: transferRecipient,
    });
    const access = await requestEventTicketPortalAccess({ email: transferRecipient.email, ip: "198.51.100.30" });
    const session = await exchangeEventTicketPortalMagicLink({ rawMagicToken: access.rawMagicToken!, ip: "198.51.100.30" });
    assert.ok(session);
    const resolved = await resolveEventTicketPortalSession(session.rawSessionToken);
    assert.ok(resolved);
    const view = await getEventTicketPortalView(resolved);
    assert.equal(view.groups.length, 1);
    assert.equal(view.groups[0].source, "INDIVIDUAL_GRANT");
    assert.deepEqual(view.groups[0].tickets.map((ticket) => ticket.ticketId), [target.id]);
    assert.equal(JSON.stringify(view).includes(sibling.id), false);
    assert.equal(JSON.stringify(view).includes(order.accessToken), false);
    const received = view.groups[0].tickets[0];
    assert.equal(received.state, "ACTIVE");
    assert.ok(!received.canTransfer && received.transferLimitReached);

    await assert.rejects(() => transferEventTicketDirectly({
      ticketId: target.id,
      portalSessionId: resolved.id,
      requestId: "blocked-second-transfer-request",
      recipient: {
        name: "Terceira Titular",
        cpf: "11144477735",
        email: "terceiro.titular@event-test.local",
        phone: "51988880000",
        birthDate: "1999-06-20",
      },
    }), /EVENT_TICKET_TRANSFER_LIMIT_REACHED/);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: target.id } }), 1);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }), 2);
    await assert.rejects(() => requestEventTicketTransfer({
      ticketId: sibling.id,
      holderCredential: { kind: "PORTAL_SESSION", portalSessionId: resolved.id },
      recipientEmail: "intruso@event-test.local",
    }), /EVENT_TICKET_TRANSFER_UNAUTHORIZED/);
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: sibling.id } }), sibling);
  } finally {
    restore();
  }
});

test("conclusao interna nao contorna o limite de uma transferencia", async () => {
  const restore = enablePortalTestEnvironment();
  const recipientC = {
    name: "Terceira Titular",
    cpf: "11144477735",
    email: "terceira.titular@event-test.local",
    phone: "51988880000",
  };
  try {
    const { event, order } = await createPaidOrderFixture(1);
    const original = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    await ensureInitialEventTicketQrVersion(original.id, testPrisma);
    const transferAB = await createReadyTransfer(original.id, transferRecipient);
    const completedAB = await completeEventTicketTransfer({
      transferId: transferAB.id, ticketId: original.id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    });
    const afterB = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: original.id } });
    const transferBC = await createReadyTransfer(original.id, recipientC);
    await assert.rejects(() => completeEventTicketTransfer({
      transferId: transferBC.id, ticketId: original.id, expectedOwnershipVersion: 2, recipient: recipientC,
    }), /EVENT_TICKET_TRANSFER_LIMIT_REACHED/);
    const afterC = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: original.id } });

    assert.deepEqual(
      { ownership: [original.ownershipVersion, afterB.ownershipVersion, afterC.ownershipVersion], qr: [original.qrVersion, afterB.qrVersion, afterC.qrVersion] },
      { ownership: [1, 2, 2], qr: [1, 2, 2] },
    );
    assert.notEqual(afterB.qrToken, original.qrToken);
    assert.equal(afterC.qrToken, afterB.qrToken);
    assert.equal(afterC.ticketCode, afterB.ticketCode);
    assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, original.qrToken)).status, "INVALID");
    assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, afterB.qrToken)).status, "VALID");
    assert.deepEqual(
      (await testPrisma.eventTicketQrVersion.findMany({ where: { ticketId: original.id }, orderBy: { version: "asc" } }))
        .map(({ version, status }) => ({ version, status })),
      [{ version: 1, status: "REVOKED" }, { version: 2, status: "ACTIVE" }],
    );
    const grants = await testPrisma.eventTicketAccessGrant.findMany({ where: { ticketId: original.id }, orderBy: { ownershipVersion: "asc" } });
    assert.deepEqual(grants.map(({ ownershipVersion, revokedAt }) => ({ ownershipVersion, active: revokedAt === null })), [
      { ownershipVersion: 2, active: true },
    ]);
    assert.equal((await resolveEventTicketAccessGrant(completedAB.rawAccessToken!, new Date(), testPrisma))?.ticket.id, original.id);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: original.id, status: "COMPLETED" } }), 1);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: transferBC.id } }), 0);
  } finally {
    restore();
  }
});

test("dois ingressos do mesmo pedido podem usar uma transferencia cada", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(2);
    const [first, second] = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    await Promise.all([ensureInitialEventTicketQrVersion(first.id, testPrisma), ensureInitialEventTicketQrVersion(second.id, testPrisma)]);
    const transferAB = await createReadyTransfer(first.id, transferRecipient);
    await completeEventTicketTransfer({
      transferId: transferAB.id, ticketId: first.id, expectedOwnershipVersion: 1, recipient: transferRecipient,
    });
    const recipientC = {
      name: "Terceira Titular",
      cpf: "11144477735",
      email: "terceira.titular@event-test.local",
      phone: "51988880000",
    };
    const transferAC = await createReadyTransfer(second.id, recipientC);
    await completeEventTicketTransfer({
      transferId: transferAC.id, ticketId: second.id, expectedOwnershipVersion: 1, recipient: recipientC,
    });
    const current = await testPrisma.eventTicket.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { participantName: "asc" } });
    assert.deepEqual(current.map(({ ownershipVersion, qrVersion }) => ({ ownershipVersion, qrVersion })), [
      { ownershipVersion: 2, qrVersion: 2 },
      { ownershipVersion: 2, qrVersion: 2 },
    ]);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: { in: [first.id, second.id] }, status: "COMPLETED" } }), 2);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: { in: [first.id, second.id] }, status: "ACTIVE" } }), 2);
  } finally {
    restore();
  }
});

test("transferencia direta A para B revoga credenciais, preserva irmao e pedido e independe do email", async () => {
  const restore = enablePortalTestEnvironment();
  const recipientB = { ...transferRecipient, birthDate: "2000-01-15" };
  try {
    const { event, order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    const target = tickets[0];
    const sibling = tickets[1];
    await ensureInitialEventTicketQrVersion(target.id, testPrisma);
    const sessionA = await createPortalSessionFor(buyer(0).email, "198.51.100.81");
    const orderBefore = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } });

    const startedAt = performance.now();
    const completed = await transferEventTicketDirectly({
      ticketId: target.id,
      portalSessionId: sessionA.id,
      requestId: "direct-main-request-0001",
      recipient: recipientB,
    });
    assert.ok(performance.now() - startedAt < 5_000, "a conclusão direta não deve alcançar o timeout legado de 5000 ms");
    assert.equal(completed.alreadyCompleted, false);
    const current = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: target.id } });
    assert.deepEqual({ owner: current.participantName, email: current.participantEmail, ownership: current.ownershipVersion, qr: current.qrVersion }, {
      owner: recipientB.name, email: recipientB.email, ownership: 2, qr: 2,
    });
    assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, target.qrToken)).status, "INVALID");
    assert.equal((await validatePortariaManualTicket(superAdminActor, event.id, target.ticketCode)).status, "INVALID");
    assert.equal((await validatePortariaQrTicketDto(superAdminActor, event.id, current.qrToken)).status, "VALID");
    assert.equal((await validatePortariaManualTicket(superAdminActor, event.id, current.ticketCode)).status, "VALID");
    assert.deepEqual(await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: sibling.id } }), sibling);
    assert.deepEqual(await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: order.orderId } }), orderBefore);
    assert.deepEqual(
      (await testPrisma.eventTicketQrVersion.findMany({ where: { ticketId: target.id }, orderBy: { version: "asc" } })).map(({ version, status }) => ({ version, status })),
      [{ version: 1, status: "REVOKED" }, { version: 2, status: "ACTIVE" }],
    );
    const transfer = await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: completed.transferId } });
    assert.equal(transfer.status, "COMPLETED");
    assert.equal(transfer.recipientConfirmedAt, null);
    assert.equal((transfer.metadata as { flow?: string }).flow, "DIRECT");
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: transfer.id } }), 2);
    const recipientMessage = await testPrisma.eventTicketTransferOutbox.findFirstOrThrow({
      where: { transferId: transfer.id, kind: "EVENT_TICKET_TRANSFER_RECIPIENT_COMPLETED" },
    });
    const recipientPayload = decryptTransferEmailPayload(recipientMessage as {
      encryptedPayload: string;
      initializationVector: string;
      authenticationTag: string;
    });
    assert.match(recipientPayload.text, new RegExp(current.ticketCode));
    assert.match(recipientPayload.text, new RegExp(current.qrToken));
    assert.match(recipientPayload.text, /Acessar meus ingressos/);

    const failedDelivery = await processEventTicketTransferOutbox({
      ids: completed.outboxIds,
      sender: async () => { throw new Error("Resend fake indisponível"); },
    });
    assert.equal(failedDelivery.failed, 2);
    assert.equal((await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: transfer.id } })).status, "COMPLETED");
    const retried = await transferEventTicketDirectly({
      ticketId: target.id,
      portalSessionId: sessionA.id,
      requestId: "direct-main-request-0001",
      recipient: recipientB,
    });
    assert.equal(retried.alreadyCompleted, true);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: target.id } }), 1);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: target.id } }), 2);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: transfer.id } }), 2);

    const admin = await getAdminEventCockpit(event.id, "ingressos");
    const adminTicket = admin?.tickets.find((ticket) => ticket.id === target.id);
    assert.equal(adminTicket?.participantName, recipientB.name);
    assert.equal(adminTicket?.buyerName, orderBefore.buyerName);
    assert.deepEqual(adminTicket?.transferHistory.map(({ fromHolderName, toHolderName }) => ({ fromHolderName, toHolderName })), [{
      fromHolderName: target.participantName,
      toHolderName: recipientB.name,
    }]);
  } finally {
    restore();
  }
});

test("processamento externo lento nao mantem a transacao direta aberta nem duplica estado", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    await ensureInitialEventTicketQrVersion(ticket.id, testPrisma);
    const sessionA = await createPortalSessionFor(buyer(0).email, "198.51.100.86");

    const commitStartedAt = performance.now();
    const completed = await transferEventTicketDirectly({
      ticketId: ticket.id,
      portalSessionId: sessionA.id,
      requestId: "direct-slow-outbox-request",
      recipient: { ...transferRecipient, birthDate: "2000-01-15" },
    });
    const commitElapsedMs = performance.now() - commitStartedAt;
    assert.ok(commitElapsedMs < 5_000, `commit direto levou ${commitElapsedMs.toFixed(0)} ms`);
    assert.equal((await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: completed.transferId } })).status, "COMPLETED");

    const deliveryStartedAt = performance.now();
    const delivery = await processEventTicketTransferOutbox({
      ids: [completed.outboxIds[0]],
      sender: async () => new Promise((resolve) => setTimeout(resolve, 5_100)),
    });
    const deliveryElapsedMs = performance.now() - deliveryStartedAt;
    assert.ok(deliveryElapsedMs >= 5_000, `envio fake levou apenas ${deliveryElapsedMs.toFixed(0)} ms`);
    assert.deepEqual(delivery, { processed: 1, sent: 1, failed: 0, exhausted: 0 });
    assert.equal((await testPrisma.eventTicketTransfer.findUniqueOrThrow({ where: { id: completed.transferId } })).status, "COMPLETED");
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: ticket.id } }), 1);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: ticket.id } }), 2);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: completed.transferId } }), 2);
  } finally {
    restore();
  }
});

test("duas tentativas simultaneas B para C sao bloqueadas sem efeito", async () => {
  const restore = enablePortalTestEnvironment();
  const recipientB = { ...transferRecipient, birthDate: "2000-01-15" };
  const recipientC = { name: "Terceira Titular", cpf: "11144477735", email: "terceira.titular@event-test.local", phone: "51988880000", birthDate: "1999-06-20" };
  try {
    const { order } = await createPaidOrderFixture(1);
    const original = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    await ensureInitialEventTicketQrVersion(original.id, testPrisma);
    const sessionA = await createPortalSessionFor(buyer(0).email, "198.51.100.82");
    const completed = await transferEventTicketDirectly({ ticketId: original.id, portalSessionId: sessionA.id, requestId: "chain-direct-request-ab", recipient: recipientB });
    const sessionB = await createPortalSessionFor(recipientB.email, "198.51.100.83");
    const beforeAttempt = {
      transfers: await testPrisma.eventTicketTransfer.count({ where: { ticketId: original.id } }),
      qrVersions: await testPrisma.eventTicketQrVersion.count({ where: { ticketId: original.id } }),
      outbox: await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: completed.transferId } }),
    };
    const attempts = await Promise.allSettled([
      transferEventTicketDirectly({ ticketId: original.id, portalSessionId: sessionB.id, requestId: "chain-direct-request-bc-one", recipient: recipientC }),
      transferEventTicketDirectly({ ticketId: original.id, portalSessionId: sessionB.id, requestId: "chain-direct-request-bc-two", recipient: recipientC }),
    ]);
    assert.ok(attempts.every((attempt) => attempt.status === "rejected" && String(attempt.reason).includes("EVENT_TICKET_TRANSFER_LIMIT_REACHED")));

    const current = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: original.id } });
    assert.deepEqual({ ownership: current.ownershipVersion, qr: current.qrVersion, email: current.participantEmail }, { ownership: 2, qr: 2, email: recipientB.email });
    const versions = await testPrisma.eventTicketQrVersion.findMany({ where: { ticketId: original.id }, orderBy: { version: "asc" } });
    assert.deepEqual(versions.map(({ version, status }) => ({ version, status })), [
      { version: 1, status: "REVOKED" }, { version: 2, status: "ACTIVE" },
    ]);
    assert.equal(await testPrisma.eventTicketAccessGrant.count({ where: { ticketId: original.id, revokedAt: null } }), 1);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: original.id } }), beforeAttempt.transfers);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: original.id } }), beforeAttempt.qrVersions);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: completed.transferId } }), beforeAttempt.outbox);
    assert.equal(await testPrisma.eventTicketTransferOutbox.count({ where: { transferId: { not: completed.transferId } } }), 0);
    const portalB = await getEventTicketPortalView({ email: recipientB.email, emailHash: hashPortalEmail(recipientB.email) });
    const visible = portalB.groups.flatMap((group) => group.tickets).find((ticket) => ticket.ticketId === original.id);
    assert.ok(visible && visible.state === "ACTIVE" && visible.transferLimitReached && !visible.canTransfer);
  } finally {
    restore();
  }
});

test("transferencias diretas concorrentes e check-in concorrente deixam somente um vencedor consistente", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { event, order } = await createPaidOrderFixture(2);
    const admin = await createTestAdminUser();
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    await Promise.all(tickets.map((ticket) => ensureInitialEventTicketQrVersion(ticket.id, testPrisma)));
    const sessionA = await createPortalSessionFor(buyer(0).email, "198.51.100.85");
    const competing = await Promise.allSettled([
      transferEventTicketDirectly({ ticketId: tickets[0].id, portalSessionId: sessionA.id, requestId: "concurrent-direct-request-one", recipient: { ...transferRecipient, birthDate: "2000-01-15" } }),
      transferEventTicketDirectly({ ticketId: tickets[0].id, portalSessionId: sessionA.id, requestId: "concurrent-direct-request-two", recipient: { name: "Outra Titular", cpf: "39053344705", email: "outra@event-test.local", phone: "51977770000", birthDate: "1998-03-02" } }),
    ]);
    expectOneSuccessOneFailure(competing);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: tickets[0].id, status: "COMPLETED" } }), 1);
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: tickets[0].id, status: "ACTIVE" } }), 1);
    assert.equal((await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[0].id } })).ownershipVersion, 2);

    const transferVsCheckIn = await Promise.allSettled([
      transferEventTicketDirectly({ ticketId: tickets[1].id, portalSessionId: sessionA.id, requestId: "concurrent-direct-checkin", recipient: { ...transferRecipient, email: "checkin-race@event-test.local", birthDate: "2000-01-15" } }),
      confirmEventTicketCheckIn({ eventId: event.id, qrToken: tickets[1].qrToken, adminUserId: admin.id, source: "QR" }),
    ]);
    expectOneSuccessOneFailure(transferVsCheckIn);
    const current = await testPrisma.eventTicket.findUniqueOrThrow({ where: { id: tickets[1].id } });
    assert.ok(
      (current.status === "VALID" && current.ownershipVersion === 2 && current.qrVersion === 2) ||
      (current.status === "USED" && current.ownershipVersion === 1 && current.qrVersion === 1),
    );
    assert.equal(await testPrisma.eventTicketQrVersion.count({ where: { ticketId: tickets[1].id, status: "ACTIVE" } }), 1);
    assert.equal(await testPrisma.eventTicketTransfer.count({ where: { ticketId: tickets[1].id, status: { in: ["PENDING_CURRENT_CONFIRMATION", "PENDING_RECIPIENT_ACCEPTANCE"] } } }), 0);
  } finally {
    restore();
  }
});

test("fase 4 projeta estados sem transferencia e aplica rate limit persistente e feature flag", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(3);
    const tickets = await testPrisma.eventTicket.findMany({ where: { eventOrderId: order.orderId }, orderBy: { participantName: "asc" } });
    await testPrisma.eventTicket.update({ where: { id: tickets[0].id }, data: { status: "USED", checkedInAt: new Date() } });
    await testPrisma.eventTicket.update({ where: { id: tickets[1].id }, data: { status: "CANCELED" } });
    await testPrisma.eventTicket.update({ where: { id: tickets[2].id }, data: { status: "REFUNDED" } });
    const view = await getEventTicketPortalView({ email: buyer(0).email, emailHash: hashPortalEmail(buyer(0).email) });
    const states = view.groups.flatMap((group) => group.tickets).map((ticket) => ticket.state).sort();
    assert.deepEqual(states, ["CANCELED", "REFUNDED", "USED"]);
    assert.ok(view.groups.flatMap((group) => group.tickets).every((ticket) =>
      ticket.state === "TRANSFERRED" || (!ticket.canTransfer && ticket.qrToken === undefined && ticket.ticketCode === undefined)));

    const now = new Date();
    assert.equal(await consumePortalRateLimits({ action: "test-ip", ip: "198.51.100.40", limit: 1, now }), true);
    assert.equal(await consumePortalRateLimits({ action: "test-ip", ip: "198.51.100.40", limit: 1, now }), false);
    const emailHash = hashPortalEmail("rate@event-test.local");
    assert.equal(await consumePortalRateLimits({ action: "test-email", ip: "198.51.100.41", emailHash, limit: 1, now }), true);
    assert.equal(await consumePortalRateLimits({ action: "test-email", ip: "198.51.100.42", emailHash, limit: 1, now }), false);

    process.env.EVENT_TICKET_PORTAL_ENABLED = "false";
    assert.equal(eventTicketPortalEnabled(), false);
    await assert.rejects(() => requestEventTicketPortalAccess({ email: buyer(0).email, ip: "198.51.100.43" }), /EVENT_TICKET_PORTAL_DISABLED/);
  } finally {
    restore();
  }
});

test("envio imediato processa somente o item persistido, resiste a concorrencia e nao reenvia SENT", async () => {
  const restore = enableTransferTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(2);
    const tickets = await testPrisma.eventTicket.findMany({
      where: { eventOrderId: order.orderId },
      orderBy: { participantName: "asc" },
    });
    const first = await requestEventTicketTransfer({
      ticketId: tickets[0].id,
      holderCredential: { kind: "ORIGINAL_ORDER", orderAccessToken: order.accessToken },
      recipientEmail: "imediato-1@event-test.local",
    });
    const second = await requestEventTicketTransfer({
      ticketId: tickets[1].id,
      holderCredential: { kind: "ORIGINAL_ORDER", orderAccessToken: order.accessToken },
      recipientEmail: "imediato-2@event-test.local",
    });
    assert.equal(first.outboxIds.length, 1);
    assert.equal(second.outboxIds.length, 1);

    let sends = 0;
    const sender = async () => {
      sends += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    };
    const concurrent = await Promise.all([
      deliverEventTicketOutboxImmediately({ transferOutboxIds: first.outboxIds, transferSender: sender }),
      deliverEventTicketOutboxImmediately({ transferOutboxIds: first.outboxIds, transferSender: sender }),
    ]);
    assert.equal(sends, 1);
    assert.equal(concurrent.reduce((sum, result) => sum + result.transfer.sent, 0), 1);

    const sent = await testPrisma.eventTicketTransferOutbox.findUniqueOrThrow({ where: { id: first.outboxIds[0] } });
    const untouched = await testPrisma.eventTicketTransferOutbox.findUniqueOrThrow({ where: { id: second.outboxIds[0] } });
    assert.equal(sent.status, "SENT");
    assert.equal(sent.encryptedPayload, null);
    assert.equal(untouched.status, "PENDING");
    assert.ok(untouched.encryptedPayload);

    await deliverEventTicketOutboxImmediately({ transferOutboxIds: first.outboxIds, transferSender: sender });
    assert.equal(sends, 1);
  } finally {
    restore();
  }
});

test("falha imediata preserva payload e o ciclo recorrente recupera sem criar dominio novamente", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    await createPaidOrderFixture(1);
    const request = await requestEventTicketPortalAccess({
      email: buyer(0).email,
      ip: "198.51.100.90",
    });
    assert.equal(request.accepted, true);
    assert.equal(request.created, true);
    assert.ok(request.outboxId);
    const before = {
      sessions: await testPrisma.eventTicketPortalSession.count(),
      grants: await testPrisma.eventTicketAccessGrant.count(),
      qrVersions: await testPrisma.eventTicketQrVersion.count(),
    };

    const immediate = await deliverEventTicketOutboxImmediately({
      portalOutboxIds: [request.outboxId!],
      portalSender: async () => { throw new Error("provider unavailable"); },
    });
    assert.equal(immediate.portal.failed, 1);
    const failed = await testPrisma.eventTicketPortalOutbox.findUniqueOrThrow({ where: { id: request.outboxId! } });
    assert.equal(failed.status, "FAILED");
    assert.ok(failed.nextAttemptAt > failed.updatedAt);
    assert.ok(failed.encryptedPayload && failed.initializationVector && failed.authenticationTag);

    let retries = 0;
    const recovered = await runEventTicketOutboxCycle({
      now: new Date(failed.nextAttemptAt.getTime() + 1),
      portalSender: async () => { retries += 1; },
    });
    assert.equal(recovered.status, "processed");
    assert.equal(retries, 1);
    const sent = await testPrisma.eventTicketPortalOutbox.findUniqueOrThrow({ where: { id: request.outboxId! } });
    assert.equal(sent.status, "SENT");
    assert.equal(sent.encryptedPayload, null);
    assert.equal(sent.initializationVector, null);
    assert.equal(sent.authenticationTag, null);
    assert.deepEqual({
      sessions: await testPrisma.eventTicketPortalSession.count(),
      grants: await testPrisma.eventTicketAccessGrant.count(),
      qrVersions: await testPrisma.eventTicketQrVersion.count(),
    }, before);
  } finally {
    restore();
  }
});

test("delivery aplica timeout, fallback SMTP e falha recuperavel quando ambos os provedores falham", async () => {
  const previous = {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
  };
  const restoreEnv = () => {
    for (const [name, value] of Object.entries({
      SMTP_HOST: previous.smtpHost,
      SMTP_PORT: previous.smtpPort,
      SMTP_USER: previous.smtpUser,
      SMTP_PASS: previous.smtpPass,
      SMTP_FROM: previous.smtpFrom,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    process.env.SMTP_HOST = "smtp.event-test.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";
    process.env.SMTP_FROM = "AAAU SMTP <smtp@aaau.test>";
    const mail = (suffix: string) => ({
      kind: EmailDeliveryKind.EVENT_TICKET_PORTAL_ACCESS,
      idempotencyKey: `delivery-strategy:${suffix}`,
      to: "delivery@event-test.local",
      subject: "Teste operacional",
      text: "Conteudo seguro",
      html: "<p>Conteudo seguro</p>",
    });

    let resendCalls = 0;
    let smtpCalls = 0;
    const fallback = await sendTrackedEmail(mail("fallback"), { testHooks: {
      resendSend: async () => { resendCalls += 1; throw new Error("resend rejected"); },
      smtpSend: async () => { smtpCalls += 1; return "smtp-fallback-id"; },
    } });
    assert.equal(fallback.reason, "sent");
    assert.deepEqual({ resendCalls, smtpCalls }, { resendCalls: 1, smtpCalls: 1 });
    assert.equal((await testPrisma.emailDelivery.findUniqueOrThrow({
      where: { idempotencyKey: "delivery-strategy:fallback" },
    })).provider, "SMTP");

    await assert.rejects(() => sendTrackedEmail(mail("both-fail"), { testHooks: {
      resendSend: async () => { throw new Error("resend rejected"); },
      smtpSend: async () => { throw new Error("smtp rejected"); },
    } }));
    assert.equal((await testPrisma.emailDelivery.findUniqueOrThrow({
      where: { idempotencyKey: "delivery-strategy:both-fail" },
    })).status, "FAILED");

    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    await assert.rejects(
      () => sendTrackedEmail(mail("timeout"), { testHooks: {
        timeoutMs: 15,
        resendSend: async () => new Promise<string>(() => undefined),
      } }),
      EmailProviderTimeoutError,
    );
    assert.equal((await testPrisma.emailDelivery.findUniqueOrThrow({
      where: { idempotencyKey: "delivery-strategy:timeout" },
    })).status, "FAILED");
  } finally {
    restoreEnv();
  }
});

test("operacao processa lote limitado das duas outboxes e isola falha parcial", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const { order } = await createPaidOrderFixture(1);
    const ticket = await testPrisma.eventTicket.findFirstOrThrow({ where: { eventOrderId: order.orderId } });
    const transfer = await requestEventTicketTransfer({
      ticketId: ticket.id,
      holderCredential: { kind: "ORIGINAL_ORDER", orderAccessToken: order.accessToken },
      recipientEmail: transferRecipient.email,
    });
    await testPrisma.eventTicketTransferOutbox.updateMany({
      where: { transferId: transfer.transferId },
      data: { attemptCount: 7 },
    });
    const portal = await requestEventTicketPortalAccess({ email: buyer(0).email, ip: "198.51.100.60" });
    assert.equal(portal.created, true);

    let transferCalls = 0;
    let portalCalls = 0;
    const cycle = await runEventTicketOutboxCycle({
      limit: 1,
      transferSender: async () => { transferCalls += 1; throw new Error("simulated delivery failure"); },
      portalSender: async () => { portalCalls += 1; },
    });
    assert.equal(cycle.status, "processed");
    if (cycle.status !== "processed") assert.fail("cycle should process");
    assert.equal(transferCalls, 1);
    assert.equal(portalCalls, 1);
    assert.equal(cycle.transfer.failed, 1);
    assert.equal(cycle.portal.sent, 1);
    assert.equal(cycle.exhausted, 1);
    assert.equal(JSON.stringify(cycle).includes(order.accessToken), false);
    assert.equal(JSON.stringify(cycle).includes(transferRecipient.email), false);

    const retry = await runEventTicketOutboxCycle({
      transferSender: async () => { transferCalls += 1; },
      portalSender: async () => { portalCalls += 1; },
    });
    assert.equal(retry.status, "processed");
    assert.equal(transferCalls, 1);
    assert.equal(portalCalls, 1);
  } finally {
    restore();
  }
});

test("operacao respeita tamanho do lote e retoma itens pendentes", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    await createPaidOrderFixture(1);
    const base = new Date();
    for (let index = 0; index < 3; index += 1) {
      const request = await requestEventTicketPortalAccess({
        email: buyer(0).email,
        ip: `198.51.100.${70 + index}`,
        now: new Date(base.getTime() + index * 6 * 60_000),
      });
      assert.equal(request.created, true);
    }
    process.env.EVENT_TICKET_TRANSFERS_ENABLED = "false";
    let sent = 0;
    const first = await runEventTicketOutboxCycle({
      limit: 2,
      now: new Date(base.getTime() + 13 * 60_000),
      portalSender: async () => { sent += 1; },
    });
    assert.equal(first.status, "processed");
    if (first.status !== "processed") assert.fail("cycle should process");
    assert.equal(first.portal.processed, 2);
    assert.equal(first.pending, 1);
    const second = await runEventTicketOutboxCycle({
      limit: 2,
      now: new Date(base.getTime() + 13 * 60_000),
      portalSender: async () => { sent += 1; },
    });
    assert.equal(second.status, "processed");
    if (second.status !== "processed") assert.fail("cycle should process");
    assert.equal(second.portal.processed, 1);
    assert.equal(second.pending, 0);
    assert.equal(sent, 3);
  } finally {
    restore();
  }
});

test("lease persistente impede duas execucoes operacionais concorrentes", async () => {
  const restore = enablePortalTestEnvironment();
  try {
    const holdLease = async () => new Promise<void>((resolve) => setTimeout(resolve, 75));
    const results = await Promise.all([
      runEventTicketOutboxCycle({ afterLeaseAcquired: holdLease }),
      runEventTicketOutboxCycle({ afterLeaseAcquired: holdLease }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), ["busy", "processed"]);
    assert.equal(await testPrisma.eventTicketPortalRateLimit.count({ where: { action: "event-ticket-outbox-lease" } }), 0);
  } finally {
    restore();
  }
});

test("emissao manual PIX e cortesia criam pedido, lote administrativo, QR v1, auditoria e sao idempotentes", async () => {
  const { event, lot: publicLot } = await createEventWithLot(10);
  const emailMessages: unknown[] = [];
  const actor = { role: "super_admin" as const, adminUserId: null };
  const pixInput = {
    eventId: event.id,
    idempotencyKey: crypto.randomUUID(),
    type: "ADMIN_PIX" as const,
    amountReceived: new Prisma.Decimal("60.00"),
    participant: participant(20),
  };
  const first = await issueManualEventTicket(pixInput, actor, {
    emailSender: { sendMail: async (message) => { emailMessages.push(message); return {}; } },
    emailFrom: "AAAU <eventos@test.local>", baseUrl: "https://aaau.test",
  });
  const duplicate = await issueManualEventTicket(pixInput, actor);
  assert.equal(first.alreadyCreated, false);
  assert.equal(duplicate.alreadyCreated, true);
  assert.equal(emailMessages.length, 1);

  const ticket = await testPrisma.eventTicket.findUniqueOrThrow({
    where: { id: first.ticketId! }, include: { qrVersions: true, lot: true, eventOrder: true },
  });
  assert.equal(ticket.eventOrder.source, "ADMIN_PIX");
  assert.equal(ticket.eventOrder.paymentMethodId, "EXTERNAL_PIX");
  assert.equal(ticket.eventOrder.total.toString(), "60");
  assert.equal(ticket.lot.publicSaleEnabled, false);
  assert.equal(ticket.ownershipVersion, 1);
  assert.equal(ticket.qrVersion, 1);
  assert.equal(ticket.qrVersions.length, 1);
  assert.equal(ticket.qrVersions[0].version, 1);
  assert.equal(ticket.qrVersions[0].status, "ACTIVE");
  assert.equal(ticket.qrVersions[0].qrTokenHash, hashEventTicketQrToken(ticket.qrToken));
  assert.equal(ticket.qrVersions[0].ticketCodeHash, hashEventTicketCode(ticket.ticketCode));
  assert.equal((await testPrisma.eventTicketLot.findUniqueOrThrow({ where: { id: publicLot.id } })).soldQuantity, 0);
  assert.equal(await testPrisma.eventAdminAuditLog.count({ where: { action: "MANUAL_TICKET_ISSUED", targetId: ticket.id } }), 1);

  const courtesy = await issueManualEventTicket({
    ...pixInput, idempotencyKey: crypto.randomUUID(), type: "COMPLIMENTARY",
    amountReceived: new Prisma.Decimal(0), participant: participant(21),
  }, actor, { emailSender: { sendMail: async () => ({}) }, emailFrom: "AAAU <eventos@test.local>", baseUrl: "https://aaau.test" });
  const courtesyOrder = await testPrisma.eventOrder.findUniqueOrThrow({ where: { id: courtesy.orderId } });
  assert.equal(courtesyOrder.source, "COMPLIMENTARY");
  assert.equal(courtesyOrder.total.toString(), "0");
  assert.equal(await testPrisma.eventTicketLot.count({ where: { eventId: event.id, publicSaleEnabled: false } }), 1);
  await assert.rejects(
    issueManualEventTicket({ ...pixInput, idempotencyKey: crypto.randomUUID() }, { role: "event_staff", adminUserId: null }),
    EventAdminForbiddenError,
  );

  const emailFailure = await issueManualEventTicket({ ...pixInput, idempotencyKey: crypto.randomUUID(), participant: participant(22) }, actor, {
    emailSender: { sendMail: async () => { throw new Error("falha simulada"); } },
    emailFrom: "AAAU <eventos@test.local>", baseUrl: "https://aaau.test",
  });
  assert.equal(emailFailure.email.reason, "smtp_failed");
  const ticketCountBeforeRetry = await testPrisma.eventTicket.count({ where: { eventOrderId: emailFailure.orderId } });
  const retryEmail = await ensureEventTicketConfirmationEmail(emailFailure.orderId, {
    sender: { sendMail: async () => ({}) }, from: "AAAU <eventos@test.local>", baseUrl: "https://aaau.test",
  });
  assert.equal(retryEmail.sent, true);
  assert.equal(await testPrisma.eventTicket.count({ where: { eventOrderId: emailFailure.orderId } }), ticketCountBeforeRetry);
});

test("pedidos de evento expirados ha mais de 24h sao arquivados apenas na visao administrativa", async () => {
  const { event } = await createEventWithLot(10);
  const recent = await reserveOrder({ eventId: event.id, idempotencyKey: "archive-recent", quantity: 1 });
  const old = await reserveOrder({ eventId: event.id, idempotencyKey: "archive-old", quantity: 1, participantOffset: 2 });
  await testPrisma.eventOrder.update({ where: { id: old.orderId }, data: { status: "EXPIRED", expiresAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
  await confirmEventOrderPayment({ eventOrderId: recent.orderId, paymentId: "PAY-ARCHIVE-PAID", paidAmount: recent.total });
  await testPrisma.eventOrder.update({ where: { id: recent.orderId }, data: { expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } });
  const active = await getAdminEventCockpit(event.id, "pedidos", { orders: { view: "active" } });
  const archived = await getAdminEventCockpit(event.id, "pedidos", { orders: { view: "archived" } });
  assert.ok(active?.orders.some((order) => order.id === recent.orderId));
  assert.equal(active?.orders.some((order) => order.id === old.orderId), false);
  assert.ok(archived?.orders.some((order) => order.id === old.orderId));
  assert.ok(await testPrisma.eventOrder.findUnique({ where: { id: old.orderId } }));
  assert.deepEqual(archivedEventOrderWhere(new Date(0)).status, { in: ["PENDING", "EXPIRED", "FAILED", "CANCELED"] });
});

test("admin pagina e filtra ingressos por participante, CPF, email, lote, codigo, origem, status e check-in sem credenciais", async () => {
  const event = await createTestTicketEvent({ maxTicketsPerOrder: 20 });
  const lot = await createTestTicketLot(event.id, { quantity: 20 });
  const code = await createTestPartnerCode(event.id, { code: "AAAU", maxUses: 20 });
  for (let index = 0; index < 11; index += 1) {
    const order = await reserveOrder({ eventId: event.id, idempotencyKey: `admin-ticket-list-${index}`, quantity: 1, participantOffset: index % 5, buyerIndex: 0, partnerCode: code.code });
    await confirmEventOrderPayment({ eventOrderId: order.orderId, paymentId: `PAY-ADMIN-LIST-${index}`, paidAmount: order.total });
  }

  const firstPage = await getAdminEventCockpit(event.id, "ingressos", { tickets: { page: 1, pageSize: 10 } });
  const secondPage = await getAdminEventCockpit(event.id, "ingressos", { tickets: { page: 2, pageSize: 10 } });
  assert.equal(firstPage?.ticketPagination.total, 11);
  assert.equal(firstPage?.tickets.length, 10);
  assert.equal(secondPage?.tickets.length, 1);
  const target = participant(2);
  for (const search of [target.name, target.cpf, target.email!]) {
    const result = await getAdminEventCockpit(event.id, "ingressos", { tickets: { search } });
    assert.ok((result?.ticketPagination.total ?? 0) >= 1);
  }
  const filtered = await getAdminEventCockpit(event.id, "ingressos", { tickets: { lotId: lot.id, partnerCodeId: code.id, source: "WEBSITE", status: "VALID", checkIn: "no" } });
  assert.equal(filtered?.ticketPagination.total, 11);
  const checkedIn = await getAdminEventCockpit(event.id, "ingressos", { tickets: { checkIn: "yes" } });
  assert.equal(checkedIn?.ticketPagination.total, 0);
  const serialized = JSON.stringify(filtered);
  assert.doesNotMatch(serialized, /qrToken|qrTokenHash|ticketCodeHash|accessToken/);
});

test("admin de ingressos suporta dados WEBSITE historicos sem codigo e sem agregados das novas origens", async () => {
  const event = await createTestTicketEvent();
  const lot = await createTestTicketLot(event.id);
  const order = await reserveOrder({
    eventId: event.id,
    idempotencyKey: `admin-historical-${crypto.randomUUID()}`,
    quantity: 1,
  });
  await confirmEventOrderPayment({
    eventOrderId: order.orderId,
    paymentId: `PAY-HISTORICAL-${crypto.randomUUID()}`,
    paidAmount: order.total,
  });

  const cockpit = await getAdminEventCockpit(event.id, "ingressos");

  assert.ok(cockpit);
  assert.equal(cockpit.tickets.length, 1);
  assert.equal(cockpit.tickets[0]?.lotName, lot.name);
  assert.equal(cockpit.tickets[0]?.partnerCode, null);
  assert.deepEqual(
    cockpit.salesBySource.map((item) => ({ source: item.source, orders: item.orders, revenue: item.revenue.toString() })),
    [
      { source: "WEBSITE", orders: 1, revenue: order.total.toString() },
      { source: "ADMIN_PIX", orders: 0, revenue: "0" },
      { source: "COMPLIMENTARY", orders: 0, revenue: "0" },
    ],
  );
  assert.equal(await testPrisma.eventTicketLot.count({ where: { eventId: event.id, publicSaleEnabled: false } }), 0);
});

test("estoque de produto por tamanho e concorrencia bloqueiam overselling sem ocultar produto ativo", async () => {
  const previous = { fetch: global.fetch, databaseUrl: process.env.DATABASE_URL, token: process.env.MERCADO_PAGO_ACCESS_TOKEN, appUrl: process.env.APP_URL };
  const slug = `stock-test-${crypto.randomUUID()}`;
  try {
    process.env.DATABASE_URL = "postgresql://test-only";
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-local";
    process.env.APP_URL = "https://aaau.test";
    let preference = 0;
    global.fetch = async () => new Response(JSON.stringify({ id: `pref-${++preference}`, init_point: "https://pay.test", sandbox_init_point: "https://pay.test" }), { status: 200, headers: { "content-type": "application/json" } });
    const product = await testPrisma.product.create({
      data: {
        name: "Camiseta Estoque", slug, price: new Prisma.Decimal("50"), description: "Produto para teste de concorrencia",
        category: "APPAREL", sizes: ["P", "M"], stock: 10, isActive: true,
        stockItems: { create: [{ variantId: "", size: "P", stock: 0 }, { variantId: "", size: "M", stock: 1 }] },
      },
    });
    const request = (key: string, size = "M") => new Request("https://aaau.test/api/checkout", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": key },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), buyer: { fullName: "Pessoa Teste", cpf: "52998224725", email: `${key}@stock-test.local`, whatsapp: "51999999999", campus: "Zona Sul" }, items: [{ productId: product.id, size, quantity: 1 }] }),
    });
    const soldOutSize = await createStoreCheckout(request("size-p", "P"));
    assert.equal(soldOutSize.status, 409);
    const results = await Promise.all([createStoreCheckout(request("buyer-a")), createStoreCheckout(request("buyer-b"))]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const inventory = await testPrisma.productStockItem.findUniqueOrThrow({ where: { productId_variantId_size: { productId: product.id, variantId: "", size: "M" } } });
    assert.equal(inventory.stock, 0);
    assert.equal(await testPrisma.order.count({ where: { items: { some: { productId: product.id } } } }), 1);
    const soldOutProduct = await getProductBySlug(slug);
    assert.equal(soldOutProduct?.stock, 0);
    assert.equal(soldOutProduct?.stockItems?.reduce((sum, item) => sum + item.stock, 0), 0);
    await testPrisma.product.update({ where: { id: product.id }, data: { isActive: false } });
    assert.equal(await getProductBySlug(slug), null);
  } finally {
    global.fetch = previous.fetch;
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.token === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN; else process.env.MERCADO_PAGO_ACCESS_TOKEN = previous.token;
    if (previous.appUrl === undefined) delete process.env.APP_URL; else process.env.APP_URL = previous.appUrl;
    await testPrisma.orderItem.deleteMany({ where: { product: { slug } } });
    await testPrisma.order.deleteMany({ where: { customerEmail: { endsWith: "@stock-test.local" } } });
    await testPrisma.product.deleteMany({ where: { slug } });
  }
});
