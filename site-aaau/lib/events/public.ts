import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getTicketLotAvailability } from "@/lib/events/availability";
import { toMoney } from "@/lib/events/money";

type PublicLot = {
  id: string;
  name: string;
  description: string | null;
  price: Prisma.Decimal;
  quantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  position: number;
  active: boolean;
};

type PublicEvent = {
  published: boolean;
  status: string;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  startAt: Date;
  endAt: Date | null;
  lowStockThreshold: number;
  lots: PublicLot[];
};

export type PublicEventStatus =
  | "SOON"
  | "OPEN"
  | "LOW_STOCK"
  | "SOLD_OUT"
  | "ENDED"
  | "CANCELED";

export function formatMoney(value: Prisma.Decimal | string | number) {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value.toString());
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(decimal.toNumber());
}

export function formatEventDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function isLotInSalesWindow(lot: Pick<PublicLot, "active" | "salesStartAt" | "salesEndAt">, now: Date) {
  return lot.active && (!lot.salesStartAt || lot.salesStartAt <= now) && (!lot.salesEndAt || lot.salesEndAt > now);
}

export function getCurrentPublicLot(event: Pick<PublicEvent, "lots">, now = new Date()) {
  return [...event.lots]
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .find((lot) => isLotInSalesWindow(lot, now) && getTicketLotAvailability(lot) > 0) ?? null;
}

export function getPublicEventStatus(event: PublicEvent, now = new Date()): PublicEventStatus {
  if (event.status === "CANCELED") return "CANCELED";
  if (event.status === "FINISHED" || (event.endAt && event.endAt <= now) || event.startAt <= now) return "ENDED";
  if (!event.published || event.status === "DRAFT") return "SOON";
  if (event.salesStartAt && event.salesStartAt > now) return "SOON";
  if (event.salesEndAt && event.salesEndAt <= now) return "ENDED";

  const lot = getCurrentPublicLot(event, now);
  if (!lot) return "SOLD_OUT";

  const available = getTicketLotAvailability(lot);
  return available <= event.lowStockThreshold ? "LOW_STOCK" : "OPEN";
}

export function publicStatusLabel(status: PublicEventStatus) {
  return {
    SOON: "Em breve",
    OPEN: "Vendas abertas",
    LOW_STOCK: "Últimos ingressos",
    SOLD_OUT: "Esgotado",
    ENDED: "Evento encerrado",
    CANCELED: "Cancelado",
  }[status];
}

export function canBuyPublicStatus(status: PublicEventStatus) {
  return status === "OPEN" || status === "LOW_STOCK";
}

export function publicEventSortWeight(status: PublicEventStatus) {
  return {
    OPEN: 0,
    LOW_STOCK: 0,
    SOON: 1,
    SOLD_OUT: 2,
    ENDED: 3,
    CANCELED: 4,
  }[status];
}

export async function getPublishedTicketEvents() {
  const now = new Date();
  const events = await prisma.ticketEvent.findMany({
    where: { published: true },
    include: { lots: true },
  });

  return events
    .map((event) => {
      const status = getPublicEventStatus(event, now);
      const currentLot = getCurrentPublicLot(event, now);
      return { ...event, publicStatus: status, currentLot };
    })
    .sort(
      (left, right) =>
        publicEventSortWeight(left.publicStatus) - publicEventSortWeight(right.publicStatus) ||
        left.startAt.getTime() - right.startAt.getTime(),
    );
}

export async function getPublishedTicketEventBySlug(slug: string) {
  const event = await prisma.ticketEvent.findFirst({
    where: { slug, published: true },
    include: { lots: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  });

  if (!event) return null;

  const publicStatus = getPublicEventStatus(event);
  const currentLot = getCurrentPublicLot(event);
  return { ...event, publicStatus, currentLot };
}

export function eventPriceLabel(event: { publicStatus: PublicEventStatus; currentLot: PublicLot | null }) {
  if (event.currentLot && canBuyPublicStatus(event.publicStatus)) {
    return `A partir de ${formatMoney(toMoney(event.currentLot.price))}`;
  }

  if (event.publicStatus === "SOON") return "Vendas em breve";
  if (event.publicStatus === "SOLD_OUT") return "Esgotado";
  return publicStatusLabel(event.publicStatus);
}
