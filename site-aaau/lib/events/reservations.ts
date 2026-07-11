import {
  InsufficientTicketAvailabilityError,
  InvalidTicketQuantityError,
  ReservationInconsistencyError,
} from "@/lib/events/errors";
import type { EventTx } from "@/lib/events/types";

function assertPositiveQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InvalidTicketQuantityError();
  }
}

export async function reserveLotTickets(tx: EventTx, lotId: string, quantity: number) {
  assertPositiveQuantity(quantity);

  const changed = await tx.$executeRaw`
    UPDATE "EventTicketLot"
    SET "reservedQuantity" = "reservedQuantity" + ${quantity}
    WHERE "id" = ${lotId}
      AND "active" = true
      AND "quantity" - "soldQuantity" - "reservedQuantity" >= ${quantity}
  `;

  if (changed !== 1) {
    throw new InsufficientTicketAvailabilityError();
  }
}

export async function confirmLotSale(tx: EventTx, lotId: string, quantity: number) {
  assertPositiveQuantity(quantity);

  const changed = await tx.$executeRaw`
    UPDATE "EventTicketLot"
    SET
      "reservedQuantity" = "reservedQuantity" - ${quantity},
      "soldQuantity" = "soldQuantity" + ${quantity}
    WHERE "id" = ${lotId}
      AND "reservedQuantity" >= ${quantity}
      AND "soldQuantity" + ${quantity} <= "quantity"
  `;

  if (changed !== 1) {
    throw new ReservationInconsistencyError();
  }
}

export async function releaseLotReservation(tx: EventTx, lotId: string, quantity: number) {
  assertPositiveQuantity(quantity);

  const changed = await tx.$executeRaw`
    UPDATE "EventTicketLot"
    SET "reservedQuantity" = "reservedQuantity" - ${quantity}
    WHERE "id" = ${lotId}
      AND "reservedQuantity" >= ${quantity}
  `;

  if (changed !== 1) {
    throw new ReservationInconsistencyError();
  }
}
