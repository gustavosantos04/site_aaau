import "dotenv/config";

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const eventName = "OPERAÇÃO CACHORRADA";
const startsAt = new Date("2026-07-16T18:00:00-03:00");
const expiresAt = new Date("2026-08-21T23:00:00-03:00");

const partners = [
  { code: "AAAU", partnerName: "AAAU" },
  { code: "SERPENTES", partnerName: "SERPENTES" },
  { code: "CORUJOES", partnerName: "CORUJÕES" },
  { code: "COIOTES", partnerName: "COIOTES" },
  { code: "POMBOS", partnerName: "POMBOS" },
  { code: "AAAD", partnerName: "AAAD" },
  { code: "RAPOSAS", partnerName: "RAPOSAS" },
  { code: "KRAKENS", partnerName: "KRAKENS" },
  { code: "AARAS", partnerName: "AARAS" },
  { code: "AAEE", partnerName: "AAEE" },
  { code: "LOBOS", partnerName: "LOBOS" },
  { code: "PANTERAS", partnerName: "PANTERAS" },
  { code: "TIGRES", partnerName: "TIGRES" },
  { code: "LIGA", partnerName: "LIGA" },
];

async function main() {
  const event = await prisma.ticketEvent.findFirst({
    where: { name: { equals: eventName, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });

  if (!event) {
    throw new Error(`Evento nao encontrado: ${eventName}`);
  }

  const created: string[] = [];
  const existing: string[] = [];

  for (const partner of partners) {
    const current = await prisma.eventPartnerCode.findUnique({
      where: { eventId_code: { eventId: event.id, code: partner.code } },
      select: { id: true },
    });

    if (current) {
      existing.push(partner.code);
      continue;
    }

    await prisma.eventPartnerCode.create({
      data: {
        eventId: event.id,
        code: partner.code,
        partnerName: partner.partnerName,
        partnerType: "ATHLETIC",
        discountType: "PERCENTAGE",
        discountValue: new Prisma.Decimal(10),
        maxUses: null,
        startsAt,
        expiresAt,
        active: true,
      },
    });
    created.push(partner.code);
  }

  const rows = await prisma.eventPartnerCode.findMany({
    where: {
      eventId: event.id,
      code: { in: partners.map((partner) => partner.code) },
    },
    orderBy: { code: "asc" },
    select: {
      code: true,
      partnerName: true,
      partnerType: true,
      discountType: true,
      discountValue: true,
      maxUses: true,
      startsAt: true,
      expiresAt: true,
      active: true,
    },
  });

  console.log(JSON.stringify({
    event,
    created,
    existing,
    totalFound: rows.length,
    rows,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
