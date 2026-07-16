-- CreateEnum
CREATE TYPE "EmailDeliveryKind" AS ENUM ('EVENT_TICKET_CONFIRMATION', 'STORE_ORDER_CONFIRMATION', 'INTERNAL_ORDER_NOTIFICATION');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'DELAYED', 'BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RESEND',
    "providerEmailId" TEXT,
    "kind" "EmailDeliveryKind" NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "orderId" TEXT,
    "eventOrderId" TEXT,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDeliveryEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "providerEmailId" TEXT NOT NULL,
    "emailDeliveryId" TEXT,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_providerEmailId_key" ON "EmailDelivery"("providerEmailId");
CREATE UNIQUE INDEX "EmailDelivery_idempotencyKey_key" ON "EmailDelivery"("idempotencyKey");
CREATE INDEX "EmailDelivery_orderId_createdAt_idx" ON "EmailDelivery"("orderId", "createdAt");
CREATE INDEX "EmailDelivery_eventOrderId_createdAt_idx" ON "EmailDelivery"("eventOrderId", "createdAt");
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");
CREATE INDEX "EmailDelivery_recipient_createdAt_idx" ON "EmailDelivery"("recipient", "createdAt");
CREATE UNIQUE INDEX "EmailDeliveryEvent_providerEventId_key" ON "EmailDeliveryEvent"("providerEventId");
CREATE INDEX "EmailDeliveryEvent_providerEmailId_occurredAt_idx" ON "EmailDeliveryEvent"("providerEmailId", "occurredAt");
CREATE INDEX "EmailDeliveryEvent_emailDeliveryId_occurredAt_idx" ON "EmailDeliveryEvent"("emailDeliveryId", "occurredAt");
CREATE INDEX "EmailDeliveryEvent_type_occurredAt_idx" ON "EmailDeliveryEvent"("type", "occurredAt");

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_eventOrderId_fkey" FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryEvent" ADD CONSTRAINT "EmailDeliveryEvent_emailDeliveryId_fkey" FOREIGN KEY ("emailDeliveryId") REFERENCES "EmailDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
