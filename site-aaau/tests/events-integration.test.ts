import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { Prisma } from "@prisma/client";

import {
  authenticateAdmin,
  createAdminSessionToken,
  parseAdminSessionToken,
} from "@/lib/auth";

import { prisma } from "@/lib/db/prisma";
import {
  EventAdminForbiddenError,
  EventAdminValidationError,
  cancelTicketEventAdmin,
  createPartnerCodeAdmin,
  createTicketEventAdmin,
  createTicketLotAdmin,
  getAdminEventCockpit,
  getAdminEventsDashboard,
  publishTicketEventAdmin,
  resendTicketConfirmationEmailAdmin,
  unpublishTicketEventAdmin,
  updatePartnerCodeAdmin,
  updateTicketLotAdmin,
} from "@/lib/events/admin";
import { confirmEventTicketCheckIn } from "@/lib/events/check-in";
import {
  AmbiguousEventTicketEmailError,
  EVENT_TICKET_EMAIL_SENDING_LEASE_MS,
  ensureEventTicketConfirmationEmail,
} from "@/lib/events/email";
import {
  EventPaymentPreferenceAmbiguousError,
  EventPaymentPreferenceCreatingError,
  IdempotencyConflictError,
  InsufficientTicketAvailabilityError,
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
import { issueEventTicketsForPaidOrder } from "@/lib/events/tickets";
import {
  getTransactionRetryMetrics,
  resetTransactionRetryMetrics,
  runSerializableTransactionWithRetry,
} from "@/lib/events/transaction";
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

before(() => {
  resetTransactionRetryMetrics();
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
});

function expectOneSuccessOneFailure<T>(results: PromiseSettledResult<T>[]) {
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
}) {
  const quantity = input.quantity ?? 1;
  const participantOffset = input.participantOffset ?? 0;

  return createEventOrderReservation({
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    buyer: buyer(input.buyerIndex ?? 0),
    partnerCode: input.partnerCode,
    participants: Array.from({ length: quantity }, (_, index) =>
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
    requireBirthDate: false,
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
    items?: Array<Record<string, unknown>>;
  }> = [];
  let calls = 0;

  try {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-event-token";
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
    assert.equal(item.unit_price, Number(persistedOrder.total.toString()));
    assert.ok(new Date(String(capturedPayload?.expiration_date_to)) <= persistedOrder.expiresAt);
  } finally {
    global.fetch = previousFetch;
    if (previousAccessToken === undefined) {
      delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    } else {
      process.env.MERCADO_PAGO_ACCESS_TOKEN = previousAccessToken;
    }
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
  const cockpit = await getAdminEventCockpit(event.id);
  assert.ok(cockpit);
  assert.equal(cockpit.kpis.paidOrdersCount, 1);
  assert.equal(cockpit.kpis.confirmedRevenue.toString(), order.total.toString());
  assert.equal(cockpit.orders.some((adminOrder) => "accessToken" in adminOrder), false);
  assert.equal(cockpit.tickets.some((ticket) => "qrToken" in ticket), false);
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
