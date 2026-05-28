/*
  Warnings:

  - You are about to drop the `EtlPipeline` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GermanHolidayConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JiraConnection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `KpiDefinition` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MetabaseConnection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PostgresConnection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `pipelineId` on the `EtlRun` table. All the data in the column will be lost.
  - You are about to drop the column `kpiDefinitionId` on the `KpiResult` table. All the data in the column will be lost.
  - Added the required column `connectionRef` to the `EtlRun` table without a default value. This is not possible if the table is not empty.
  - Added the required column `connectionRef` to the `KpiResult` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kpiId` to the `KpiResult` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kpiName` to the `KpiResult` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EtlPipeline";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "GermanHolidayConfig";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "JiraConnection";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "KpiDefinition";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MetabaseConnection";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PostgresConnection";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "MasterTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionRef" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "priority" TEXT,
    "status" TEXT NOT NULL,
    "assignee" TEXT,
    "reporter" TEXT,
    "created" DATETIME NOT NULL,
    "updated" DATETIME NOT NULL,
    "resolved" DATETIME,
    "dueDate" DATETIME,
    "storyPoints" REAL,
    "labels" TEXT NOT NULL,
    "components" TEXT,
    "rawData" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EtlRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionRef" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ticketsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "jql" TEXT,
    "dateFrom" TEXT,
    "dateTo" TEXT,
    "autoSave" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT,
    "sizeBytes" INTEGER
);
INSERT INTO "new_EtlRun" ("completedAt", "errorLog", "id", "startedAt", "status", "ticketsProcessed") SELECT "completedAt", "errorLog", "id", "startedAt", "status", "ticketsProcessed" FROM "EtlRun";
DROP TABLE "EtlRun";
ALTER TABLE "new_EtlRun" RENAME TO "EtlRun";
CREATE INDEX "EtlRun_connectionRef_idx" ON "EtlRun"("connectionRef");
CREATE INDEX "EtlRun_completedAt_idx" ON "EtlRun"("completedAt");
CREATE INDEX "EtlRun_status_idx" ON "EtlRun"("status");
CREATE TABLE "new_KpiResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionRef" TEXT NOT NULL,
    "etlRunId" TEXT,
    "kpiId" TEXT NOT NULL,
    "kpiName" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT,
    "dimensions" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KpiResult_etlRunId_fkey" FOREIGN KEY ("etlRunId") REFERENCES "EtlRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KpiResult" ("calculatedAt", "dimensions", "etlRunId", "id", "periodEnd", "periodStart", "unit", "value") SELECT "calculatedAt", "dimensions", "etlRunId", "id", "periodEnd", "periodStart", "unit", "value" FROM "KpiResult";
DROP TABLE "KpiResult";
ALTER TABLE "new_KpiResult" RENAME TO "KpiResult";
CREATE INDEX "KpiResult_connectionRef_idx" ON "KpiResult"("connectionRef");
CREATE INDEX "KpiResult_kpiId_idx" ON "KpiResult"("kpiId");
CREATE INDEX "KpiResult_periodStart_periodEnd_idx" ON "KpiResult"("periodStart", "periodEnd");
CREATE INDEX "KpiResult_calculatedAt_idx" ON "KpiResult"("calculatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MasterTicket_connectionRef_idx" ON "MasterTicket"("connectionRef");

-- CreateIndex
CREATE INDEX "MasterTicket_jiraKey_idx" ON "MasterTicket"("jiraKey");

-- CreateIndex
CREATE INDEX "MasterTicket_status_idx" ON "MasterTicket"("status");

-- CreateIndex
CREATE INDEX "MasterTicket_created_idx" ON "MasterTicket"("created");

-- CreateIndex
CREATE UNIQUE INDEX "MasterTicket_connectionRef_jiraKey_key" ON "MasterTicket"("connectionRef", "jiraKey");
