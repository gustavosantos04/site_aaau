-- Store both Mercado Pago checkout links for idempotent event checkout responses.

ALTER TABLE "EventOrder" ADD COLUMN IF NOT EXISTS "mercadoPagoSandboxInitPoint" TEXT;
