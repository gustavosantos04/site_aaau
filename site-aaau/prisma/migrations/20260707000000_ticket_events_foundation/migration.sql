-- Ticket events foundation.
-- This migration intentionally does not alter the existing "Event" model/table.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TicketEventStatus') THEN
    CREATE TYPE "TicketEventStatus" AS ENUM (
      'DRAFT',
      'PUBLISHED',
      'SALES_OPEN',
      'SOLD_OUT',
      'FINISHED',
      'CANCELED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventOrderStatus') THEN
    CREATE TYPE "EventOrderStatus" AS ENUM (
      'PENDING',
      'PAID',
      'FAILED',
      'CANCELED',
      'REFUNDED',
      'EXPIRED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventTicketStatus') THEN
    CREATE TYPE "EventTicketStatus" AS ENUM (
      'VALID',
      'USED',
      'CANCELED',
      'REFUNDED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventPartnerType') THEN
    CREATE TYPE "EventPartnerType" AS ENUM (
      'ATHLETIC',
      'PARTNER',
      'PROMOTION',
      'OTHER'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventPartnerDiscountType') THEN
    CREATE TYPE "EventPartnerDiscountType" AS ENUM (
      'PERCENTAGE',
      'FIXED'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventCheckInAction') THEN
    CREATE TYPE "EventCheckInAction" AS ENUM (
      'QR_VALIDATE',
      'QR_CONFIRM',
      'MANUAL_CONFIRM',
      'ADMIN_REVERSAL'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventCheckInResult') THEN
    CREATE TYPE "EventCheckInResult" AS ENUM (
      'VALID',
      'CHECKED_IN',
      'ALREADY_USED',
      'INVALID',
      'WRONG_EVENT',
      'UNAUTHORIZED',
      'REVERSED'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "TicketEvent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "shortDescription" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "bannerImage" TEXT,
  "coverImage" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "salesStartAt" TIMESTAMP(3),
  "salesEndAt" TIMESTAMP(3),
  "venueName" TEXT NOT NULL,
  "venueAddress" TEXT,
  "minimumAge" INTEGER,
  "status" "TicketEventStatus" NOT NULL DEFAULT 'DRAFT',
  "published" BOOLEAN NOT NULL DEFAULT false,
  "showRemainingTickets" BOOLEAN NOT NULL DEFAULT false,
  "maxTicketsPerOrder" INTEGER NOT NULL DEFAULT 4,
  "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
  "requireParticipantEmail" BOOLEAN NOT NULL DEFAULT false,
  "requireParticipantPhone" BOOLEAN NOT NULL DEFAULT false,
  "requireBirthDate" BOOLEAN NOT NULL DEFAULT false,
  "requireInstitution" BOOLEAN NOT NULL DEFAULT false,
  "requireCourse" BOOLEAN NOT NULL DEFAULT false,
  "requireCampus" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventTicketLot" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(10,2) NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "salesStartAt" TIMESTAMP(3),
  "salesEndAt" TIMESTAMP(3),
  "position" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "autoActivate" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventTicketLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventPartnerCode" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "partnerName" TEXT NOT NULL,
  "partnerType" "EventPartnerType" NOT NULL DEFAULT 'PARTNER',
  "discountType" "EventPartnerDiscountType" NOT NULL,
  "discountValue" DECIMAL(10,2) NOT NULL,
  "maxUses" INTEGER,
  "reservedUses" INTEGER NOT NULL DEFAULT 0,
  "confirmedUses" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventPartnerCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventOrder" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerCpf" TEXT,
  "buyerCpfHash" TEXT,
  "buyerCpfLast4" TEXT,
  "buyerEmail" TEXT NOT NULL,
  "buyerPhone" TEXT NOT NULL,
  "partnerCodeId" TEXT,
  "subtotal" DECIMAL(10,2) NOT NULL,
  "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL,
  "status" "EventOrderStatus" NOT NULL DEFAULT 'PENDING',
  "mercadoPagoPreferenceId" TEXT,
  "mercadoPagoInitPoint" TEXT,
  "mercadoPagoPaymentId" TEXT,
  "paymentMethodId" TEXT,
  "paymentTypeId" TEXT,
  "statusDetail" TEXT,
  "externalReference" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "accessToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventOrderParticipant" (
  "id" TEXT NOT NULL,
  "eventOrderId" TEXT NOT NULL,
  "ticketLotId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cpf" TEXT NOT NULL,
  "cpfHash" TEXT,
  "cpfLast4" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "birthDate" TIMESTAMP(3),
  "institution" TEXT,
  "course" TEXT,
  "campus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventOrderParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventTicket" (
  "id" TEXT NOT NULL,
  "eventOrderId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "orderParticipantId" TEXT NOT NULL,
  "participantName" TEXT NOT NULL,
  "participantCpf" TEXT,
  "participantCpfHash" TEXT,
  "participantCpfLast4" TEXT,
  "participantEmail" TEXT,
  "participantPhone" TEXT,
  "birthDate" TIMESTAMP(3),
  "institution" TEXT,
  "course" TEXT,
  "campus" TEXT,
  "ticketCode" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "status" "EventTicketStatus" NOT NULL DEFAULT 'VALID',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkedInAt" TIMESTAMP(3),
  "checkedInByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventCheckInLog" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT,
  "eventId" TEXT NOT NULL,
  "adminUserId" TEXT,
  "action" "EventCheckInAction" NOT NULL,
  "result" "EventCheckInResult" NOT NULL,
  "deviceInfo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventCheckInLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EventAdminAuditLog" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "adminUserId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventAdminAuditLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentEvent" ADD COLUMN IF NOT EXISTS "eventOrderId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TicketEvent_slug_key" ON "TicketEvent"("slug");
CREATE INDEX IF NOT EXISTS "TicketEvent_published_startAt_idx" ON "TicketEvent"("published", "startAt");
CREATE INDEX IF NOT EXISTS "TicketEvent_status_startAt_idx" ON "TicketEvent"("status", "startAt");
CREATE INDEX IF NOT EXISTS "TicketEvent_salesStartAt_salesEndAt_idx" ON "TicketEvent"("salesStartAt", "salesEndAt");

CREATE INDEX IF NOT EXISTS "EventTicketLot_eventId_position_idx" ON "EventTicketLot"("eventId", "position");
CREATE INDEX IF NOT EXISTS "EventTicketLot_eventId_active_salesStartAt_salesEndAt_idx" ON "EventTicketLot"("eventId", "active", "salesStartAt", "salesEndAt");

CREATE UNIQUE INDEX IF NOT EXISTS "EventPartnerCode_eventId_code_key" ON "EventPartnerCode"("eventId", "code");
CREATE INDEX IF NOT EXISTS "EventPartnerCode_eventId_active_idx" ON "EventPartnerCode"("eventId", "active");
CREATE INDEX IF NOT EXISTS "EventPartnerCode_code_idx" ON "EventPartnerCode"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "EventOrder_externalReference_key" ON "EventOrder"("externalReference");
CREATE UNIQUE INDEX IF NOT EXISTS "EventOrder_idempotencyKey_key" ON "EventOrder"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "EventOrder_accessToken_key" ON "EventOrder"("accessToken");
CREATE UNIQUE INDEX IF NOT EXISTS "EventOrder_mercadoPagoPaymentId_key" ON "EventOrder"("mercadoPagoPaymentId");
CREATE INDEX IF NOT EXISTS "EventOrder_eventId_status_createdAt_idx" ON "EventOrder"("eventId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "EventOrder_status_expiresAt_idx" ON "EventOrder"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "EventOrder_mercadoPagoPreferenceId_idx" ON "EventOrder"("mercadoPagoPreferenceId");
CREATE INDEX IF NOT EXISTS "EventOrder_partnerCodeId_idx" ON "EventOrder"("partnerCodeId");
CREATE INDEX IF NOT EXISTS "EventOrder_idempotencyKey_idx" ON "EventOrder"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "EventOrderParticipant_eventOrderId_idx" ON "EventOrderParticipant"("eventOrderId");
CREATE INDEX IF NOT EXISTS "EventOrderParticipant_ticketLotId_idx" ON "EventOrderParticipant"("ticketLotId");
CREATE INDEX IF NOT EXISTS "EventOrderParticipant_cpfHash_idx" ON "EventOrderParticipant"("cpfHash");

CREATE UNIQUE INDEX IF NOT EXISTS "EventTicket_orderParticipantId_key" ON "EventTicket"("orderParticipantId");
CREATE UNIQUE INDEX IF NOT EXISTS "EventTicket_ticketCode_key" ON "EventTicket"("ticketCode");
CREATE UNIQUE INDEX IF NOT EXISTS "EventTicket_qrToken_key" ON "EventTicket"("qrToken");
CREATE INDEX IF NOT EXISTS "EventTicket_eventId_status_idx" ON "EventTicket"("eventId", "status");
CREATE INDEX IF NOT EXISTS "EventTicket_eventOrderId_idx" ON "EventTicket"("eventOrderId");
CREATE INDEX IF NOT EXISTS "EventTicket_lotId_idx" ON "EventTicket"("lotId");
CREATE INDEX IF NOT EXISTS "EventTicket_participantCpfHash_idx" ON "EventTicket"("participantCpfHash");
CREATE INDEX IF NOT EXISTS "EventTicket_checkedInAt_idx" ON "EventTicket"("checkedInAt");

CREATE INDEX IF NOT EXISTS "EventCheckInLog_eventId_createdAt_idx" ON "EventCheckInLog"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventCheckInLog_ticketId_createdAt_idx" ON "EventCheckInLog"("ticketId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventCheckInLog_adminUserId_createdAt_idx" ON "EventCheckInLog"("adminUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "EventAdminAuditLog_eventId_createdAt_idx" ON "EventAdminAuditLog"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventAdminAuditLog_adminUserId_createdAt_idx" ON "EventAdminAuditLog"("adminUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "EventAdminAuditLog_targetType_targetId_idx" ON "EventAdminAuditLog"("targetType", "targetId");

CREATE INDEX IF NOT EXISTS "PaymentEvent_eventOrderId_createdAt_idx" ON "PaymentEvent"("eventOrderId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicketLot_eventId_fkey') THEN
    ALTER TABLE "EventTicketLot"
      ADD CONSTRAINT "EventTicketLot_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventPartnerCode_eventId_fkey') THEN
    ALTER TABLE "EventPartnerCode"
      ADD CONSTRAINT "EventPartnerCode_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrder_eventId_fkey') THEN
    ALTER TABLE "EventOrder"
      ADD CONSTRAINT "EventOrder_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrder_partnerCodeId_fkey') THEN
    ALTER TABLE "EventOrder"
      ADD CONSTRAINT "EventOrder_partnerCodeId_fkey"
      FOREIGN KEY ("partnerCodeId") REFERENCES "EventPartnerCode"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrderParticipant_eventOrderId_fkey') THEN
    ALTER TABLE "EventOrderParticipant"
      ADD CONSTRAINT "EventOrderParticipant_eventOrderId_fkey"
      FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventOrderParticipant_ticketLotId_fkey') THEN
    ALTER TABLE "EventOrderParticipant"
      ADD CONSTRAINT "EventOrderParticipant_ticketLotId_fkey"
      FOREIGN KEY ("ticketLotId") REFERENCES "EventTicketLot"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicket_eventOrderId_fkey') THEN
    ALTER TABLE "EventTicket"
      ADD CONSTRAINT "EventTicket_eventOrderId_fkey"
      FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicket_eventId_fkey') THEN
    ALTER TABLE "EventTicket"
      ADD CONSTRAINT "EventTicket_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicket_lotId_fkey') THEN
    ALTER TABLE "EventTicket"
      ADD CONSTRAINT "EventTicket_lotId_fkey"
      FOREIGN KEY ("lotId") REFERENCES "EventTicketLot"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicket_orderParticipantId_fkey') THEN
    ALTER TABLE "EventTicket"
      ADD CONSTRAINT "EventTicket_orderParticipantId_fkey"
      FOREIGN KEY ("orderParticipantId") REFERENCES "EventOrderParticipant"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventTicket_checkedInByUserId_fkey') THEN
    ALTER TABLE "EventTicket"
      ADD CONSTRAINT "EventTicket_checkedInByUserId_fkey"
      FOREIGN KEY ("checkedInByUserId") REFERENCES "AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCheckInLog_ticketId_fkey') THEN
    ALTER TABLE "EventCheckInLog"
      ADD CONSTRAINT "EventCheckInLog_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCheckInLog_eventId_fkey') THEN
    ALTER TABLE "EventCheckInLog"
      ADD CONSTRAINT "EventCheckInLog_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCheckInLog_adminUserId_fkey') THEN
    ALTER TABLE "EventCheckInLog"
      ADD CONSTRAINT "EventCheckInLog_adminUserId_fkey"
      FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventAdminAuditLog_eventId_fkey') THEN
    ALTER TABLE "EventAdminAuditLog"
      ADD CONSTRAINT "EventAdminAuditLog_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventAdminAuditLog_adminUserId_fkey') THEN
    ALTER TABLE "EventAdminAuditLog"
      ADD CONSTRAINT "EventAdminAuditLog_adminUserId_fkey"
      FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentEvent_eventOrderId_fkey') THEN
    ALTER TABLE "PaymentEvent"
      ADD CONSTRAINT "PaymentEvent_eventOrderId_fkey"
      FOREIGN KEY ("eventOrderId") REFERENCES "EventOrder"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
