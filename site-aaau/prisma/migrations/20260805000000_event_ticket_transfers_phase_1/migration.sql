-- Event ticket transfers, phase 1.
-- This migration is intentionally additive and does not rotate or revoke any existing credential.

CREATE TYPE "EventTicketTransferStatus" AS ENUM (
  'PENDING_CURRENT_CONFIRMATION',
  'PENDING_RECIPIENT_ACCEPTANCE',
  'COMPLETED',
  'CANCELED',
  'EXPIRED',
  'REJECTED'
);

CREATE TYPE "EventTicketTransferKind" AS ENUM ('TRANSFER', 'RESALE');

CREATE TYPE "EventTicketQrVersionStatus" AS ENUM ('ACTIVE', 'REVOKED');

ALTER TABLE "EventTicket"
  ADD COLUMN "ownershipVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "qrVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "originalOrderAccessRevokedAt" TIMESTAMP(3),
  ADD COLUMN "transferredAt" TIMESTAMP(3),
  ADD COLUMN "lastQrRotatedAt" TIMESTAMP(3);

CREATE TABLE "EventTicketTransfer" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "status" "EventTicketTransferStatus" NOT NULL DEFAULT 'PENDING_CURRENT_CONFIRMATION',
  "kind" "EventTicketTransferKind" NOT NULL DEFAULT 'TRANSFER',
  "fromOwnershipVersion" INTEGER NOT NULL,
  "toOwnershipVersion" INTEGER,
  "fromHolderName" TEXT NOT NULL,
  "fromHolderEmail" TEXT,
  "fromHolderEmailHash" TEXT,
  "toHolderName" TEXT NOT NULL,
  "toHolderEmail" TEXT NOT NULL,
  "toHolderEmailHash" TEXT NOT NULL,
  "toHolderCpfHash" TEXT,
  "toHolderCpfLast4" TEXT,
  "toHolderPhone" TEXT,
  "currentHolderConfirmationTokenHash" TEXT,
  "recipientAcceptanceTokenHash" TEXT,
  "currentHolderConfirmedAt" TIMESTAMP(3),
  "recipientConfirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "initiatedByAdminUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventTicketTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTicketAccessGrant" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "ownershipVersion" INTEGER NOT NULL,
  "holderEmail" TEXT NOT NULL,
  "holderEmailHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastAccessAt" TIMESTAMP(3),
  "createdFromTransferId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventTicketAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTicketQrVersion" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "qrTokenHash" TEXT NOT NULL,
  "ticketCodeHash" TEXT NOT NULL,
  "status" "EventTicketQrVersionStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "transferId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventTicketQrVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventTicket_originalOrderAccessRevokedAt_idx"
  ON "EventTicket"("originalOrderAccessRevokedAt");

CREATE UNIQUE INDEX "EventTicketTransfer_currentHolderConfirmationTokenHash_key"
  ON "EventTicketTransfer"("currentHolderConfirmationTokenHash");
CREATE UNIQUE INDEX "EventTicketTransfer_recipientAcceptanceTokenHash_key"
  ON "EventTicketTransfer"("recipientAcceptanceTokenHash");
CREATE INDEX "EventTicketTransfer_ticketId_status_createdAt_idx"
  ON "EventTicketTransfer"("ticketId", "status", "createdAt");
CREATE INDEX "EventTicketTransfer_status_expiresAt_idx"
  ON "EventTicketTransfer"("status", "expiresAt");
CREATE INDEX "EventTicketTransfer_toHolderEmailHash_status_idx"
  ON "EventTicketTransfer"("toHolderEmailHash", "status");
CREATE INDEX "EventTicketTransfer_initiatedByAdminUserId_createdAt_idx"
  ON "EventTicketTransfer"("initiatedByAdminUserId", "createdAt");
CREATE UNIQUE INDEX "EventTicketTransfer_one_pending_per_ticket_key"
  ON "EventTicketTransfer"("ticketId")
  WHERE "status" IN ('PENDING_CURRENT_CONFIRMATION', 'PENDING_RECIPIENT_ACCEPTANCE');

CREATE UNIQUE INDEX "EventTicketAccessGrant_tokenHash_key"
  ON "EventTicketAccessGrant"("tokenHash");
CREATE INDEX "EventTicketAccessGrant_ticketId_revokedAt_idx"
  ON "EventTicketAccessGrant"("ticketId", "revokedAt");
CREATE INDEX "EventTicketAccessGrant_holderEmailHash_revokedAt_idx"
  ON "EventTicketAccessGrant"("holderEmailHash", "revokedAt");
CREATE INDEX "EventTicketAccessGrant_createdFromTransferId_idx"
  ON "EventTicketAccessGrant"("createdFromTransferId");
CREATE UNIQUE INDEX "EventTicketAccessGrant_one_active_per_ticket_key"
  ON "EventTicketAccessGrant"("ticketId")
  WHERE "revokedAt" IS NULL;

CREATE UNIQUE INDEX "EventTicketQrVersion_qrTokenHash_key"
  ON "EventTicketQrVersion"("qrTokenHash");
CREATE UNIQUE INDEX "EventTicketQrVersion_ticketCodeHash_key"
  ON "EventTicketQrVersion"("ticketCodeHash");
CREATE UNIQUE INDEX "EventTicketQrVersion_ticketId_version_key"
  ON "EventTicketQrVersion"("ticketId", "version");
CREATE INDEX "EventTicketQrVersion_ticketId_status_idx"
  ON "EventTicketQrVersion"("ticketId", "status");
CREATE INDEX "EventTicketQrVersion_transferId_idx"
  ON "EventTicketQrVersion"("transferId");
CREATE UNIQUE INDEX "EventTicketQrVersion_one_active_per_ticket_key"
  ON "EventTicketQrVersion"("ticketId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "EventTicketTransfer"
  ADD CONSTRAINT "EventTicketTransfer_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventTicketTransfer"
  ADD CONSTRAINT "EventTicketTransfer_initiatedByAdminUserId_fkey"
  FOREIGN KEY ("initiatedByAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventTicketAccessGrant"
  ADD CONSTRAINT "EventTicketAccessGrant_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventTicketAccessGrant"
  ADD CONSTRAINT "EventTicketAccessGrant_createdFromTransferId_fkey"
  FOREIGN KEY ("createdFromTransferId") REFERENCES "EventTicketTransfer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventTicketQrVersion"
  ADD CONSTRAINT "EventTicketQrVersion_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventTicketQrVersion"
  ADD CONSTRAINT "EventTicketQrVersion_transferId_fkey"
  FOREIGN KEY ("transferId") REFERENCES "EventTicketTransfer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
