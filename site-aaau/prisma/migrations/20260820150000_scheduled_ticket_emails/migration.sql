ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_REMINDER';

CREATE TYPE "EventTicketReminderCampaignType" AS ENUM ('EVENT_TICKET_REMINDER');
CREATE TYPE "EventTicketReminderCampaignStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_FAILURES', 'CANCELED');
CREATE TYPE "EventTicketReminderDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "EventTicketReminderCampaign" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "campaignType" "EventTicketReminderCampaignType" NOT NULL DEFAULT 'EVENT_TICKET_REMINDER',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "EventTicketReminderCampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "idempotencyKey" TEXT NOT NULL,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTicketReminderCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTicketReminderDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "status" "EventTicketReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "recipient" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTicketReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventTicketReminderCampaign_idempotencyKey_key" ON "EventTicketReminderCampaign"("idempotencyKey");
CREATE UNIQUE INDEX "EventTicketReminderCampaign_eventId_campaignType_scheduledFor_key" ON "EventTicketReminderCampaign"("eventId", "campaignType", "scheduledFor");
CREATE INDEX "EventTicketReminderCampaign_status_scheduledFor_idx" ON "EventTicketReminderCampaign"("status", "scheduledFor");
CREATE INDEX "EventTicketReminderCampaign_eventId_createdAt_idx" ON "EventTicketReminderCampaign"("eventId", "createdAt");
CREATE UNIQUE INDEX "EventTicketReminderDelivery_campaignId_ticketId_key" ON "EventTicketReminderDelivery"("campaignId", "ticketId");
CREATE INDEX "EventTicketReminderDelivery_status_nextAttemptAt_idx" ON "EventTicketReminderDelivery"("status", "nextAttemptAt");
CREATE INDEX "EventTicketReminderDelivery_campaignId_status_idx" ON "EventTicketReminderDelivery"("campaignId", "status");
CREATE INDEX "EventTicketReminderDelivery_ticketId_createdAt_idx" ON "EventTicketReminderDelivery"("ticketId", "createdAt");

ALTER TABLE "EventTicketReminderCampaign" ADD CONSTRAINT "EventTicketReminderCampaign_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventTicketReminderCampaign" ADD CONSTRAINT "EventTicketReminderCampaign_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventTicketReminderDelivery" ADD CONSTRAINT "EventTicketReminderDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EventTicketReminderCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventTicketReminderDelivery" ADD CONSTRAINT "EventTicketReminderDelivery_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
