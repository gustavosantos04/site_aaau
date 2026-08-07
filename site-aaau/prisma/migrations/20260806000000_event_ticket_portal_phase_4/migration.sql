ALTER TYPE "EmailDeliveryKind" ADD VALUE 'EVENT_TICKET_PORTAL_ACCESS';

CREATE TYPE "EventTicketPortalOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

ALTER TABLE "EmailDelivery" ADD COLUMN "portalSessionId" TEXT;

CREATE TABLE "EventTicketPortalSession" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "magicLinkTokenHash" TEXT,
    "sessionTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "magicLinkConsumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTicketPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTicketPortalOutbox" (
    "id" TEXT NOT NULL,
    "portalSessionId" TEXT NOT NULL,
    "status" "EventTicketPortalOutboxStatus" NOT NULL DEFAULT 'PENDING',
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
    CONSTRAINT "EventTicketPortalOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTicketPortalRateLimit" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTicketPortalRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventTicketPortalSession_magicLinkTokenHash_key" ON "EventTicketPortalSession"("magicLinkTokenHash");
CREATE UNIQUE INDEX "EventTicketPortalSession_sessionTokenHash_key" ON "EventTicketPortalSession"("sessionTokenHash");
CREATE INDEX "EventTicketPortalSession_emailHash_createdAt_idx" ON "EventTicketPortalSession"("emailHash", "createdAt");
CREATE INDEX "EventTicketPortalSession_expiresAt_revokedAt_idx" ON "EventTicketPortalSession"("expiresAt", "revokedAt");
CREATE UNIQUE INDEX "EventTicketPortalOutbox_idempotencyKey_key" ON "EventTicketPortalOutbox"("idempotencyKey");
CREATE INDEX "EventTicketPortalOutbox_status_nextAttemptAt_idx" ON "EventTicketPortalOutbox"("status", "nextAttemptAt");
CREATE INDEX "EventTicketPortalOutbox_portalSessionId_createdAt_idx" ON "EventTicketPortalOutbox"("portalSessionId", "createdAt");
CREATE UNIQUE INDEX "EventTicketPortalRateLimit_keyHash_key" ON "EventTicketPortalRateLimit"("keyHash");
CREATE INDEX "EventTicketPortalRateLimit_action_expiresAt_idx" ON "EventTicketPortalRateLimit"("action", "expiresAt");
CREATE INDEX "EmailDelivery_portalSessionId_createdAt_idx" ON "EmailDelivery"("portalSessionId", "createdAt");

ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_portalSessionId_fkey" FOREIGN KEY ("portalSessionId") REFERENCES "EventTicketPortalSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventTicketPortalOutbox" ADD CONSTRAINT "EventTicketPortalOutbox_portalSessionId_fkey" FOREIGN KEY ("portalSessionId") REFERENCES "EventTicketPortalSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
