ALTER TABLE "EventTicketLot"
  ADD COLUMN "ticketsPerUnit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maxUnitsPerOrder" INTEGER,
  ADD COLUMN "exclusiveWindow" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "EventOrder"
  ADD COLUMN "ticketLotId" TEXT,
  ADD COLUMN "commercialUnitQuantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "ticketsPerUnit" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "commercialUnitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;

WITH order_units AS (
  SELECT
    p."eventOrderId",
    MIN(p."ticketLotId") AS "ticketLotId",
    COUNT(*)::INTEGER AS "unitQuantity"
  FROM "EventOrderParticipant" p
  GROUP BY p."eventOrderId"
)
UPDATE "EventOrder" o
SET
  "ticketLotId" = u."ticketLotId",
  "commercialUnitQuantity" = u."unitQuantity",
  "ticketsPerUnit" = 1,
  "commercialUnitPrice" = CASE
    WHEN u."unitQuantity" > 0 THEN ROUND(o."subtotal" / u."unitQuantity", 2)
    ELSE o."subtotal"
  END
FROM order_units u
WHERE o."id" = u."eventOrderId";

UPDATE "EventOrder"
SET "commercialUnitPrice" = "subtotal"
WHERE "ticketLotId" IS NULL;

ALTER TABLE "EventTicketLot"
  ADD CONSTRAINT "EventTicketLot_ticketsPerUnit_check" CHECK ("ticketsPerUnit" >= 1),
  ADD CONSTRAINT "EventTicketLot_maxUnitsPerOrder_check" CHECK ("maxUnitsPerOrder" IS NULL OR "maxUnitsPerOrder" >= 1);

ALTER TABLE "EventOrder"
  ADD CONSTRAINT "EventOrder_commercialUnitQuantity_check" CHECK ("commercialUnitQuantity" >= 1),
  ADD CONSTRAINT "EventOrder_ticketsPerUnit_check" CHECK ("ticketsPerUnit" >= 1);

CREATE INDEX "EventOrder_ticketLotId_status_idx"
  ON "EventOrder"("ticketLotId", "status");

ALTER TABLE "EventOrder"
  ADD CONSTRAINT "EventOrder_ticketLotId_fkey"
  FOREIGN KEY ("ticketLotId") REFERENCES "EventTicketLot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
