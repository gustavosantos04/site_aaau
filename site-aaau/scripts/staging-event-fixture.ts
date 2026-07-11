import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { cpfHash } from "@/lib/checkout/mercado-pago";
import { hashPassword } from "@/lib/password";
import { getConfiguredBaseUrl } from "@/lib/site-url";

const prisma = new PrismaClient();
const fixturePrefix = "staging-portaria-fixture-v1";
const fixtureSlug = `${fixturePrefix}-evento`;
const staffEmail = `${fixturePrefix}@event-test.local`;

function assertFixtureAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Fixture de staging bloqueado em NODE_ENV=production.");
  }
  if (process.env.ALLOW_STAGING_EVENT_FIXTURE !== "true") {
    throw new Error("Defina ALLOW_STAGING_EVENT_FIXTURE=true somente no processo autorizado.");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL de staging precisa estar definida.");
  }
  if (!process.env.ADMIN_EMAIL?.trim() || !process.env.ADMIN_PASSWORD) {
    throw new Error("Configure o super_admin legado antes de preparar o fixture.");
  }

  const appUrl = new URL(getConfiguredBaseUrl({ nodeEnv: "production" }));
  if (appUrl.protocol !== "https:") {
    throw new Error("APP_URL do staging precisa usar HTTPS.");
  }
}

function token(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

async function cleanupFixture() {
  const events = await prisma.ticketEvent.findMany({
    where: { slug: { startsWith: fixturePrefix } },
    select: { id: true },
  });
  const eventIds = events.map(({ id }) => id);
  const users = await prisma.adminUser.findMany({
    where: { email: staffEmail },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);

  await prisma.$transaction(async (tx) => {
    await tx.paymentEvent.deleteMany({ where: { eventOrder: { eventId: { in: eventIds } } } });
    await tx.eventCheckInLog.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventAdminAuditLog.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventStaffAssignment.deleteMany({
      where: { OR: [{ eventId: { in: eventIds } }, { adminUserId: { in: userIds } }] },
    });
    await tx.eventTicket.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventOrderParticipant.deleteMany({ where: { eventOrder: { eventId: { in: eventIds } } } });
    await tx.eventOrder.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventPartnerCode.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventTicketLot.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.ticketEvent.deleteMany({ where: { id: { in: eventIds } } });
    await tx.adminUser.deleteMany({ where: { id: { in: userIds } } });
  });

  return { removedEvents: eventIds.length, removedStaffUsers: userIds.length };
}

async function createFixture() {
  const staffPassword = process.env.STAGING_EVENT_STAFF_PASSWORD;
  if (!staffPassword || staffPassword.length < 12) {
    throw new Error("STAGING_EVENT_STAFF_PASSWORD temporaria precisa ter pelo menos 12 caracteres.");
  }

  await cleanupFixture();
  const now = new Date();
  const accessToken = token("access");

  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.ticketEvent.create({
      data: {
        name: "Teste Fisico da Portaria",
        slug: fixtureSlug,
        shortDescription: "Evento ficticio para teste fisico da portaria em staging.",
        description: "Nao utilizar para vendas ou participantes reais.",
        startAt: new Date(now.getTime() - 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 6 * 60 * 60 * 1000),
        salesStartAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        salesEndAt: new Date(now.getTime() + 60 * 60 * 1000),
        venueName: "Local ficticio de staging",
        status: "SALES_OPEN",
        published: true,
        maxTicketsPerOrder: 10,
      },
    });
    const lot = await tx.eventTicketLot.create({
      data: {
        eventId: event.id,
        name: "Lote de teste",
        price: "50.00",
        quantity: 20,
        soldQuantity: 5,
        position: 1,
        active: true,
      },
    });
    const staff = await tx.adminUser.create({
      data: {
        name: "Staff Teste Portaria",
        email: staffEmail,
        passwordHash: await hashPassword(staffPassword),
        role: "event_staff",
        isActive: true,
      },
    });
    await tx.eventStaffAssignment.create({
      data: { eventId: event.id, adminUserId: staff.id, active: true },
    });
    const order = await tx.eventOrder.create({
      data: {
        eventId: event.id,
        buyerName: "Comprador Ficticio Staging",
        buyerEmail: staffEmail,
        buyerPhone: "51999999999",
        subtotal: "250.00",
        total: "250.00",
        status: "PAID",
        externalReference: `${fixturePrefix}-${token("order")}`,
        accessToken,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
        paidAt: now,
        ticketConfirmationEmailStatus: "NOT_SENT",
      },
    });

    const cpfs = ["52998224725", "11144477735", "12345678909", "98765432100", "16899535009"];
    const statuses = ["VALID", "VALID", "USED", "CANCELED", "REFUNDED"] as const;
    for (const [index, status] of statuses.entries()) {
      const cpf = cpfs[index];
      const participant = await tx.eventOrderParticipant.create({
        data: {
          eventOrderId: order.id,
          ticketLotId: lot.id,
          name: `Participante Ficticio ${index + 1}`,
          cpf,
          cpfHash: cpfHash(cpf),
          cpfLast4: cpf.slice(-4),
        },
      });
      const checkedInAt = status === "USED" ? new Date(now.getTime() - 5 * 60 * 1000) : null;
      const ticket = await tx.eventTicket.create({
        data: {
          eventOrderId: order.id,
          eventId: event.id,
          lotId: lot.id,
          orderParticipantId: participant.id,
          participantName: participant.name,
          participantCpfHash: participant.cpfHash,
          participantCpfLast4: participant.cpfLast4,
          ticketCode: `STG-${String(index + 1).padStart(3, "0")}-${randomBytes(3).toString("hex").toUpperCase()}`,
          qrToken: token("tk"),
          status,
          checkedInAt,
          checkedInByUserId: checkedInAt ? staff.id : null,
        },
      });
      if (checkedInAt) {
        await tx.eventCheckInLog.create({
          data: {
            eventId: event.id,
            ticketId: ticket.id,
            adminUserId: staff.id,
            action: "MANUAL_CONFIRM",
            result: "CHECKED_IN",
            createdAt: checkedInAt,
          },
        });
      }
    }
    return { eventId: event.id };
  });

  const baseUrl = getConfiguredBaseUrl({ nodeEnv: "production" });
  console.log("Fixture de staging criado com dados exclusivamente ficticios.");
  console.log(`Ingressos: ${baseUrl}/meus-ingressos/${accessToken}`);
  console.log(`Portaria: ${baseUrl}/portaria`);
  console.log(`Event staff: ${staffEmail}`);
  console.log("Senha: utilize o valor temporario fornecido em STAGING_EVENT_STAFF_PASSWORD; ele nao foi persistido em texto puro.");
  return created;
}

async function main() {
  assertFixtureAllowed();
  try {
    if (process.argv[2] === "cleanup") {
      const result = await cleanupFixture();
      console.log(`Cleanup concluido: eventos=${result.removedEvents} staff=${result.removedStaffUsers}`);
      return;
    }
    await createFixture();
  } finally {
    await prisma.$disconnect();
  }
}

void main();
