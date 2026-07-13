-- CreateTable
CREATE TABLE "EventStaffAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAdminUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventStaffAssignment_eventId_adminUserId_key" ON "EventStaffAssignment"("eventId", "adminUserId");

-- CreateIndex
CREATE INDEX "EventStaffAssignment_adminUserId_active_idx" ON "EventStaffAssignment"("adminUserId", "active");

-- CreateIndex
CREATE INDEX "EventStaffAssignment_eventId_active_idx" ON "EventStaffAssignment"("eventId", "active");

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventStaffAssignment" ADD CONSTRAINT "EventStaffAssignment_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
