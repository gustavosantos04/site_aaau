CREATE TYPE "EventTicketConfirmationEmailStatus" AS ENUM ('NOT_SENT', 'SENDING', 'SENT', 'AMBIGUOUS');

ALTER TABLE "EventOrder"
  ADD COLUMN "ticketConfirmationEmailStatus" "EventTicketConfirmationEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "ticketConfirmationEmailStartedAt" TIMESTAMP(3),
  ADD COLUMN "ticketConfirmationEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "ticketConfirmationEmailLastErrorAt" TIMESTAMP(3);

CREATE INDEX "EventOrder_ticketConfirmationEmailStatus_ticketConfirmationEmailStartedAt_idx"
  ON "EventOrder"("ticketConfirmationEmailStatus", "ticketConfirmationEmailStartedAt");
