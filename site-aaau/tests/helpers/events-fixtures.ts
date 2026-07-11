import { Prisma } from "@prisma/client";

import { testPrisma } from "@/tests/helpers/events-integration-db";

let sequence = 0;

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

export const VALID_CPFS = [
  "52998224725",
  "39053344705",
  "15350946056",
  "11144477735",
  "93541134780",
  "75821643003",
];

export function participant(index = 0) {
  return {
    name: `Participante Teste ${index + 1}`,
    cpf: VALID_CPFS[index % VALID_CPFS.length],
    email: `participante${index + 1}@event-test.local`,
    phone: "51999990000",
  };
}

export function buyer(index = 0) {
  return {
    name: `Comprador Teste ${index + 1}`,
    cpf: VALID_CPFS[(index + 3) % VALID_CPFS.length],
    email: `comprador${index + 1}@event-test.local`,
    phone: "51988880000",
  };
}

export async function createTestTicketEvent(
  overrides: Partial<Prisma.TicketEventUncheckedCreateInput> = {},
) {
  const id = nextId("event");
  return testPrisma.ticketEvent.create({
    data: {
      id,
      name: `Evento Teste ${id}`,
      slug: id,
      shortDescription: "Evento de teste",
      description: "Evento de teste para integracao",
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      salesStartAt: new Date(Date.now() - 60 * 60 * 1000),
      salesEndAt: new Date(Date.now() + 60 * 60 * 1000),
      venueName: "Arena de Teste",
      status: "SALES_OPEN",
      published: true,
      maxTicketsPerOrder: 10,
      ...overrides,
    },
  });
}

export async function createTestTicketLot(
  eventId: string,
  overrides: Partial<Prisma.EventTicketLotUncheckedCreateInput> = {},
) {
  return testPrisma.eventTicketLot.create({
    data: {
      eventId,
      name: "Lote Teste",
      price: new Prisma.Decimal("50.00"),
      quantity: 10,
      reservedQuantity: 0,
      soldQuantity: 0,
      active: true,
      autoActivate: true,
      position: 1,
      salesStartAt: new Date(Date.now() - 60 * 60 * 1000),
      salesEndAt: new Date(Date.now() + 60 * 60 * 1000),
      ...overrides,
    },
  });
}

export async function createTestPartnerCode(
  eventId: string,
  overrides: Partial<Prisma.EventPartnerCodeUncheckedCreateInput> = {},
) {
  return testPrisma.eventPartnerCode.create({
    data: {
      eventId,
      code: `CODE${nextId("P").replace(/\W/g, "").toUpperCase()}`,
      partnerName: "Parceiro Teste",
      partnerType: "PARTNER",
      discountType: "PERCENTAGE",
      discountValue: new Prisma.Decimal("10.00"),
      active: true,
      reservedUses: 0,
      confirmedUses: 0,
      ...overrides,
    },
  });
}

export async function createEventWithLot(quantity = 10) {
  const event = await createTestTicketEvent();
  const lot = await createTestTicketLot(event.id, { quantity });
  return { event, lot };
}

export async function createTestAdminUser() {
  return testPrisma.adminUser.create({
    data: {
      name: "Porteiro Teste",
      email: `${nextId("staff")}@event-test.local`,
      passwordHash: "test-hash",
      role: "event_staff",
    },
  });
}
