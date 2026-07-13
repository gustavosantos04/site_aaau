-- Persist canonical payload fingerprints for idempotent event order reservations.

ALTER TABLE "EventOrder" ADD COLUMN IF NOT EXISTS "payloadFingerprint" TEXT;
CREATE INDEX IF NOT EXISTS "EventOrder_payloadFingerprint_idx" ON "EventOrder"("payloadFingerprint");
