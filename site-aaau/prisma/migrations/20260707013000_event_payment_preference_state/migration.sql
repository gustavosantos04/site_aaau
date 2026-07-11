-- Coordinate Mercado Pago event preference creation across concurrent processes.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventPaymentPreferenceStatus') THEN
    CREATE TYPE "EventPaymentPreferenceStatus" AS ENUM (
      'NOT_CREATED',
      'CREATING',
      'CREATED',
      'AMBIGUOUS'
    );
  END IF;
END $$;

ALTER TABLE "EventOrder"
  ADD COLUMN IF NOT EXISTS "paymentPreferenceStatus" "EventPaymentPreferenceStatus" NOT NULL DEFAULT 'NOT_CREATED',
  ADD COLUMN IF NOT EXISTS "paymentPreferenceCreationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentPreferenceLastErrorAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "EventOrder_paymentPreferenceStatus_idx"
  ON "EventOrder"("paymentPreferenceStatus");
