-- Products: inventory support for admin product creation.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "stock" INTEGER NOT NULL DEFAULT 0;

-- Management: optional Instagram handle per member.
ALTER TABLE "ManagementMemberRecord" ADD COLUMN IF NOT EXISTS "instagram" TEXT;

-- Orders and Mercado Pago payment tracking.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentStatus') THEN
    CREATE TYPE "PaymentStatus" AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELED',
      'REFUNDED',
      'UNKNOWN'
    );
  END IF;
END
$$;

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerCpf" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerCampus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'MERCADO_PAGO';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mercadoPagoPreferenceId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mercadoPagoPaymentId" TEXT;

CREATE TABLE IF NOT EXISTS "PaymentEvent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "provider" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PaymentEvent_orderId_fkey'
  ) THEN
    ALTER TABLE "PaymentEvent"
      ADD CONSTRAINT "PaymentEvent_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "Order_paymentStatus_createdAt_idx" ON "Order"("paymentStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "Order_mercadoPagoPreferenceId_idx" ON "Order"("mercadoPagoPreferenceId");
CREATE INDEX IF NOT EXISTS "Order_mercadoPagoPaymentId_idx" ON "Order"("mercadoPagoPaymentId");
CREATE INDEX IF NOT EXISTS "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");
