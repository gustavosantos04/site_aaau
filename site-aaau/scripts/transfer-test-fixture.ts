import { prisma } from "@/lib/db/prisma";
import { confirmEventOrderPayment, createEventOrderReservation } from "@/lib/events/orders";
import { requestEventTicketPortalAccess } from "@/lib/events/portal-session";
import {
  decryptPortalEmailPayload,
  encryptPortalEmailPayload,
  hashPortalMagicLinkToken,
} from "@/lib/events/portal-security";

const FIXTURE_SLUG = "festival-universitario-e2e-2026";
const BUYER_EMAIL = "ana.almeida@event-test.local";
const MAGIC_TOKEN = "local-e2e-ana-magic-link-2026-000000000000000001";

function assertIsolatedEnvironment() {
  if (process.env.TRANSFER_TEST_FIXTURE_ALLOWED !== "true") {
    throw new Error("TRANSFER_TEST_FIXTURE_FORBIDDEN");
  }
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (
    database.hostname !== "postgres" ||
    database.port !== "5432" ||
    database.pathname !== "/aaau_transfer_manual" ||
    process.env.SMTP_HOST !== "mailpit" ||
    process.env.RESEND_API_KEY?.trim() ||
    process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  ) {
    throw new Error("TRANSFER_TEST_FIXTURE_REQUIRES_ISOLATED_DOCKER_SERVICES");
  }
}

async function ensurePartialIndexes() {
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EventTicketTransfer_one_pending_per_ticket_key"
    ON "EventTicketTransfer" ("ticketId")
    WHERE "status" IN ('PENDING_CURRENT_CONFIRMATION', 'PENDING_RECIPIENT_ACCEPTANCE')`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EventTicketAccessGrant_one_active_per_ticket_key"
    ON "EventTicketAccessGrant" ("ticketId")
    WHERE "revokedAt" IS NULL`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "EventTicketQrVersion_one_active_per_ticket_key"
    ON "EventTicketQrVersion" ("ticketId")
    WHERE "status" = 'ACTIVE'`);
}

async function fixtureSnapshot() {
  const event = await prisma.ticketEvent.findUnique({
    where: { slug: FIXTURE_SLUG },
    include: {
      orders: {
        include: {
          tickets: {
            include: { qrVersions: { orderBy: { version: "asc" } } },
            orderBy: { participantName: "asc" },
          },
        },
      },
    },
  });
  if (!event) return null;
  const order = event.orders.find((candidate) => candidate.idempotencyKey === "manual-direct-transfer-order-a");
  if (!order) throw new Error("TRANSFER_TEST_FIXTURE_ORDER_MISSING");
  const transferCount = await prisma.eventTicketTransfer.count({
    where: { ticket: { eventId: event.id } },
  });
  const portalSession = await prisma.eventTicketPortalSession.findFirst({
    where: { email: BUYER_EMAIL, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return { event, order, tickets: order.tickets, transferCount, portalSession };
}

function printSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof fixtureSnapshot>>>) {
  const initialQrState = snapshot.tickets.every((ticket) =>
    ticket.ownershipVersion === 1 && ticket.qrVersion === 1 &&
    ticket.qrVersions.length === 1 && ticket.qrVersions[0].status === "ACTIVE");
  console.log(JSON.stringify({
    fixture: initialQrState && snapshot.transferCount === 0 ? "INITIAL" : "MODIFIED_BY_TEST",
    event: { id: snapshot.event.id, name: snapshot.event.name, minimumAge: snapshot.event.minimumAge },
    order: { id: snapshot.order.id, status: snapshot.order.status, buyerName: snapshot.order.buyerName },
    tickets: snapshot.tickets.map((ticket) => ({
      id: ticket.id,
      participantName: ticket.participantName,
      ownershipVersion: ticket.ownershipVersion,
      qrVersion: ticket.qrVersion,
      qrVersions: ticket.qrVersions.map(({ version, status }) => ({ version, status })),
    })),
    transferCount: snapshot.transferCount,
    magicLinkReady: Boolean(snapshot.portalSession?.magicLinkTokenHash),
    magicUrl: `http://localhost:3000/meus-ingressos/acesso/${MAGIC_TOKEN}`,
    appUrl: "http://localhost:3000",
    mailpitUrl: "http://localhost:8026",
  }, null, 2));
}

async function createFixture() {
  const now = new Date();
  const startAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
  const event = await prisma.ticketEvent.create({
    data: {
      name: "Festival Universitário E2E 2026",
      slug: FIXTURE_SLUG,
      shortDescription: "Fixture local de transferência direta",
      description: "Evento inteiramente fictício para validação local A → B.",
      startAt,
      salesStartAt: new Date(now.getTime() - 24 * 60 * 60_000),
      salesEndAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
      venueName: "Arena Local de Testes",
      venueAddress: "Rua Fictícia, 100 - Porto Alegre/RS",
      status: "SALES_OPEN",
      published: true,
      minimumAge: 18,
      requireParticipantEmail: true,
      requireParticipantPhone: true,
      requireBirthDate: true,
      maxTicketsPerOrder: 4,
      lots: {
        create: {
          name: "Lote E2E",
          price: "75.00",
          quantity: 20,
          active: true,
          autoActivate: true,
          position: 1,
          salesStartAt: new Date(now.getTime() - 24 * 60 * 60_000),
          salesEndAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
        },
      },
    },
    include: { lots: true },
  });
  const buyer = {
    name: "Ana Almeida",
    cpf: "52998224725",
    email: BUYER_EMAIL,
    phone: "51999990001",
  };
  const order = await createEventOrderReservation({
    eventId: event.id,
    ticketLotId: event.lots[0].id,
    commercialUnitQuantity: 2,
    idempotencyKey: "manual-direct-transfer-order-a",
    buyer,
    participants: [
      { ...buyer, birthDate: "1996-04-12" },
      {
        name: "Alice Acompanhante",
        cpf: "15350946056",
        email: "alice.acompanhante@event-test.local",
        phone: "51999990002",
        birthDate: "1997-09-03",
      },
    ],
  });
  await confirmEventOrderPayment({
    eventOrderId: order.orderId,
    paymentId: "PAYMENT-FAKE-LOCAL-A-001",
    paidAmount: order.total,
  });
  const portal = await requestEventTicketPortalAccess({ email: BUYER_EMAIL, ip: "127.0.0.1" });
  if (!portal.created || !portal.rawMagicToken || !portal.sessionId || !portal.outboxId) {
    throw new Error("TRANSFER_TEST_MAGIC_LINK_NOT_CREATED");
  }
  const outbox = await prisma.eventTicketPortalOutbox.findUniqueOrThrow({ where: { id: portal.outboxId } });
  if (!outbox.encryptedPayload || !outbox.initializationVector || !outbox.authenticationTag) {
    throw new Error("TRANSFER_TEST_PORTAL_OUTBOX_INVALID");
  }
  const oldPayload = decryptPortalEmailPayload(outbox as {
    encryptedPayload: string;
    initializationVector: string;
    authenticationTag: string;
  });
  const replaceToken = (value: string) => value.split(portal.rawMagicToken!).join(MAGIC_TOKEN);
  const encrypted = encryptPortalEmailPayload({
    subject: oldPayload.subject,
    text: replaceToken(oldPayload.text),
    html: replaceToken(oldPayload.html),
  });
  await prisma.$transaction([
    prisma.eventTicketPortalSession.update({
      where: { id: portal.sessionId },
      data: { magicLinkTokenHash: hashPortalMagicLinkToken(MAGIC_TOKEN) },
    }),
    prisma.eventTicketPortalOutbox.update({ where: { id: outbox.id }, data: encrypted }),
  ]);
}

async function restoreMagicLink() {
  const snapshot = await fixtureSnapshot();
  if (!snapshot?.portalSession) throw new Error("TRANSFER_TEST_PORTAL_SESSION_MISSING");
  await prisma.$transaction([
    prisma.eventTicketPortalSession.update({
      where: { id: snapshot.portalSession.id },
      data: {
        magicLinkTokenHash: hashPortalMagicLinkToken(MAGIC_TOKEN),
        magicLinkConsumedAt: null,
        sessionTokenHash: null,
        revokedAt: null,
        lastAccessAt: null,
      },
    }),
    prisma.eventTicketPortalRateLimit.deleteMany(),
  ]);
}

async function main() {
  assertIsolatedEnvironment();
  await ensurePartialIndexes();
  const command = process.argv[2] ?? "ensure";
  if (command === "restore-magic") await restoreMagicLink();
  else if (command === "ensure" && !await fixtureSnapshot()) await createFixture();
  else if (!['ensure', 'show'].includes(command)) throw new Error(`TRANSFER_TEST_FIXTURE_COMMAND_INVALID:${command}`);
  const snapshot = await fixtureSnapshot();
  if (!snapshot) throw new Error("TRANSFER_TEST_FIXTURE_MISSING");
  printSnapshot(snapshot);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "TRANSFER_TEST_FIXTURE_FAILED");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

