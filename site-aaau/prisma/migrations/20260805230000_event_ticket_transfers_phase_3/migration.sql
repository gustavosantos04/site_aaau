ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_HOLDER_CONFIRMATION';
ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_RECIPIENT_INVITATION';
ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_RECIPIENT_COMPLETED';
ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_PREVIOUS_HOLDER_COMPLETED';
ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_CANCELED';
ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_REJECTED';
ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_TRANSFER_EXPIRED';

CREATE TYPE "EventTicketTransferOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "EmailDelivery" ADD COLUMN "transferId" TEXT;
ALTER TABLE "EventTicketTransfer" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "EventTicketTransfer" ADD COLUMN "expiredAt" TIMESTAMP(3);

CREATE TABLE "EventTicketTransferOutbox" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "kind" "EmailDeliveryKind" NOT NULL,
    "status" "EventTicketTransferOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "encryptedPayload" TEXT,
    "initializationVector" TEXT,
    "authenticationTag" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTicketTransferOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventTicketTransferOutbox_idempotencyKey_key" ON "EventTicketTransferOutbox"("idempotencyKey");
CREATE INDEX "EventTicketTransferOutbox_status_nextAttemptAt_idx" ON "EventTicketTransferOutbox"("status", "nextAttemptAt");
CREATE INDEX "EventTicketTransferOutbox_transferId_kind_idx" ON "EventTicketTransferOutbox"("transferId", "kind");
CREATE INDEX "EmailDelivery_transferId_createdAt_idx" ON "EmailDelivery"("transferId", "createdAt");

ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "EventTicketTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventTicketTransferOutbox" ADD CONSTRAINT "EventTicketTransferOutbox_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "EventTicketTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
