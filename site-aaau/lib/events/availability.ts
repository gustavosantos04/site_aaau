import type { EventTicketLot, TicketEvent } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  EventNotFoundError,
  EventNotPublishedError,
  EventSalesEndedError,
  EventSalesNotStartedError,
  InconsistentTicketCountersError,
  NoActiveTicketLotError,
} from "@/lib/events/errors";
import type { EventTx } from "@/lib/events/types";

export type LotLike = Pick<
  EventTicketLot,
  | "id"
  | "active"
  | "quantity"
  | "price"
  | "reservedQuantity"
  | "soldQuantity"
  | "salesStartAt"
  | "salesEndAt"
  | "position"
> & Partial<Pick<EventTicketLot, "ticketsPerUnit" | "maxUnitsPerOrder" | "exclusiveWindow" | "publicSaleEnabled">>;

type EventSaleLike = Pick<
  TicketEvent,
  "published" | "status" | "salesStartAt" | "salesEndAt"
>;

export function getTicketLotAvailability(lot: Pick<LotLike, "quantity" | "reservedQuantity" | "soldQuantity">) {
  const availableQuantity = lot.quantity - lot.reservedQuantity - lot.soldQuantity;

  if (
    lot.quantity < 0 ||
    lot.reservedQuantity < 0 ||
    lot.soldQuantity < 0 ||
    lot.reservedQuantity + lot.soldQuantity > lot.quantity ||
    availableQuantity < 0
  ) {
    throw new InconsistentTicketCountersError();
  }

  return availableQuantity;
}

export function assertTicketEventSalesOpen(event: EventSaleLike, now = new Date()) {
  if (!event.published) {
    throw new EventNotPublishedError();
  }

  if (event.status === "CANCELED" || event.status === "FINISHED" || event.status === "SOLD_OUT") {
    throw new EventSalesEndedError();
  }

  if (event.salesStartAt && event.salesStartAt > now) {
    throw new EventSalesNotStartedError();
  }

  if (event.salesEndAt && event.salesEndAt <= now) {
    throw new EventSalesEndedError();
  }
}

export function isLotTemporallyEligible(lot: LotLike, now: Date) {
  return (
    lot.active &&
    lot.publicSaleEnabled !== false &&
    (!lot.salesStartAt || lot.salesStartAt <= now) &&
    (!lot.salesEndAt || lot.salesEndAt > now)
  );
}

function sortedLots<T extends LotLike>(lots: T[]): T[] {
  return [...lots].sort((left, right) =>
    left.position - right.position || left.id.localeCompare(right.id));
}

export function getExclusiveTicketLot<T extends LotLike>(lots: T[], now = new Date()): T | null {
  return sortedLots(lots).find((lot) =>
    lot.exclusiveWindow === true && isLotTemporallyEligible(lot, now) && getTicketLotAvailability(lot) > 0) ?? null;
}

export function getTicketLotMaxUnitsPerOrder(
  event: Pick<TicketEvent, "maxTicketsPerOrder">,
  lot: Pick<LotLike, "ticketsPerUnit" | "maxUnitsPerOrder">,
) {
  const ticketsPerUnit = lot.ticketsPerUnit ?? 1;
  const eventLimit = Math.floor(event.maxTicketsPerOrder / ticketsPerUnit);
  return Math.max(0, lot.maxUnitsPerOrder == null ? eventLimit : Math.min(eventLimit, lot.maxUnitsPerOrder));
}

export function getTicketCountForCommercialUnits(
  lot: Pick<LotLike, "ticketsPerUnit">,
  commercialUnitQuantity: number,
) {
  return (lot.ticketsPerUnit ?? 1) * commercialUnitQuantity;
}

export function selectActiveTicketLot<T extends LotLike>(lots: T[], now = new Date()): T {
  const exclusiveLot = getExclusiveTicketLot(lots, now);
  if (exclusiveLot) return exclusiveLot;

  for (const lot of sortedLots(lots)) {
    if (!isLotTemporallyEligible(lot, now)) {
      continue;
    }

    if (getTicketLotAvailability(lot) > 0) {
      return lot;
    }
  }

  throw new NoActiveTicketLotError();
}

export async function getActiveTicketLot(eventId: string, now = new Date(), client: EventTx | typeof prisma = prisma) {
  const event = await client.ticketEvent.findUnique({
    where: { id: eventId },
    include: { lots: true },
  });

  if (!event) {
    throw new EventNotFoundError();
  }

  assertTicketEventSalesOpen(event, now);
  return selectActiveTicketLot(event.lots, now);
}

export async function getTicketEventAvailability(eventId: string, now = new Date()) {
  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: { lots: { orderBy: [{ position: "asc" }, { id: "asc" }] } },
  });

  if (!event) {
    throw new EventNotFoundError();
  }

  assertTicketEventSalesOpen(event, now);
  const lots = event.lots.map((lot) => ({
    lot,
    availableQuantity: getTicketLotAvailability(lot),
    isCurrent: false,
  }));
  const activeLot = selectActiveTicketLot(event.lots, now);

  return {
    event,
    lots: lots.map((entry) => ({
      ...entry,
      isCurrent: entry.lot.id === activeLot.id,
    })),
    activeLot,
  };
}
