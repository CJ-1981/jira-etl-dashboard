-- Bring the migration history in line with the current schema. These objects were
-- previously applied only via `prisma db push`, so they were missing from the
-- migration folder and `prisma migrate deploy` could not reproduce the schema.

-- AlterTable
ALTER TABLE "MasterTicket" ADD COLUMN "issueOwnerTeam" TEXT;

-- CreateTable
CREATE TABLE "DashboardView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "connectionRef" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "autoSaveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "DashboardView_connectionRef_idx" ON "DashboardView"("connectionRef");

-- CreateIndex
CREATE INDEX "KpiResult_etlRunId_idx" ON "KpiResult"("etlRunId");

-- CreateIndex
CREATE INDEX "TicketSnapshot_etlRunId_idx" ON "TicketSnapshot"("etlRunId");

-- CreateIndex
CREATE INDEX "TicketSnapshot_etlRunId_jiraKey_idx" ON "TicketSnapshot"("etlRunId", "jiraKey");

-- CreateIndex
CREATE INDEX "TicketTransition_ticketSnapshotId_idx" ON "TicketTransition"("ticketSnapshotId");
