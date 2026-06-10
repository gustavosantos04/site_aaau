-- AlterTable
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Order" ADD COLUMN "checkoutSessionKey" TEXT,
ADD COLUMN "mercadoPagoInitPoint" TEXT,
ADD COLUMN "paymentMethodId" TEXT,
ADD COLUMN "paymentTypeId" TEXT,
ADD COLUMN "statusDetail" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "customerCpfHash" TEXT,
ADD COLUMN "customerCpfLast4" TEXT;

-- Backfill non-sensitive CPF metadata for legacy rows when CPF exists.
UPDATE "Order"
SET "customerCpfLast4" = RIGHT(REGEXP_REPLACE(COALESCE("customerCpf", ''), '\D', '', 'g'), 4)
WHERE "customerCpf" IS NOT NULL AND "customerCpfLast4" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutSessionKey_key" ON "Order"("checkoutSessionKey");
CREATE UNIQUE INDEX "Order_mercadoPagoPaymentId_key" ON "Order"("mercadoPagoPaymentId");
CREATE INDEX "Order_checkoutSessionKey_idx" ON "Order"("checkoutSessionKey");

-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN "mercadoPagoPaymentId" TEXT,
ADD COLUMN "webhookRequestId" TEXT,
ADD COLUMN "status" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_webhookRequestId_key" ON "PaymentEvent"("webhookRequestId");
CREATE INDEX "PaymentEvent_mercadoPagoPaymentId_idx" ON "PaymentEvent"("mercadoPagoPaymentId");
