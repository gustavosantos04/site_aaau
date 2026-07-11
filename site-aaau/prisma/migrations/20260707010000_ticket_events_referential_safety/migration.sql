-- Ticket events referential safety.
-- Keep issued tickets and financial/history rows from becoming valid or deleted implicitly.

ALTER TABLE "EventTicket" ALTER COLUMN "status" DROP DEFAULT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicketLot_eventId_fkey') THEN
    ALTER TABLE "EventTicketLot" DROP CONSTRAINT "EventTicketLot_eventId_fkey";
  END IF;

  ALTER TABLE "EventTicketLot"
    ADD CONSTRAINT "EventTicketLot_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventPartnerCode_eventId_fkey') THEN
    ALTER TABLE "EventPartnerCode" DROP CONSTRAINT "EventPartnerCode_eventId_fkey";
  END IF;

  ALTER TABLE "EventPartnerCode"
    ADD CONSTRAINT "EventPartnerCode_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrderParticipant_eventOrderId_fkey') THEN
    ALTER TABLE "EventOrderParticipant" DROP CONSTRAINT "EventOrderParticipant_eventOrderId_fkey";
  END IF;

  ALTER TABLE "EventOrderParticipant"
    ADD CONSTRAINT "EventOrderParticipant_eventOrderId_fkey"
    FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicket_eventOrderId_fkey') THEN
    ALTER TABLE "EventTicket" DROP CONSTRAINT "EventTicket_eventOrderId_fkey";
  END IF;

  ALTER TABLE "EventTicket"
    ADD CONSTRAINT "EventTicket_eventOrderId_fkey"
    FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCheckInLog_eventId_fkey') THEN
    ALTER TABLE "EventCheckInLog" DROP CONSTRAINT "EventCheckInLog_eventId_fkey";
  END IF;

  ALTER TABLE "EventCheckInLog"
    ADD CONSTRAINT "EventCheckInLog_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END
$$;
