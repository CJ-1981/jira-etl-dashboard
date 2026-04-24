-- CreateTable
CREATE TABLE "JiraConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiToken" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "projectKeys" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EtlPipeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jiraConnectionId" TEXT NOT NULL,
    "schedule" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EtlPipeline_jiraConnectionId_fkey" FOREIGN KEY ("jiraConnectionId") REFERENCES "JiraConnection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EtlRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipelineId" TEXT,
    "status" TEXT NOT NULL,
    "ticketsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "EtlRun_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "EtlPipeline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "etlRunId" TEXT NOT NULL,
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
    CONSTRAINT "TicketSnapshot_etlRunId_fkey" FOREIGN KEY ("etlRunId") REFERENCES "EtlRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TicketTransition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketSnapshotId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "author" TEXT,
    "occurredAt" DATETIME NOT NULL,
    CONSTRAINT "TicketTransition_ticketSnapshotId_fkey" FOREIGN KEY ("ticketSnapshotId") REFERENCES "TicketSnapshot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KpiDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "pluginType" TEXT NOT NULL DEFAULT 'builtin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KpiResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kpiDefinitionId" TEXT NOT NULL,
    "etlRunId" TEXT,
    "value" REAL NOT NULL,
    "unit" TEXT,
    "dimensions" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KpiResult_kpiDefinitionId_fkey" FOREIGN KEY ("kpiDefinitionId") REFERENCES "KpiDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostgresConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5432,
    "database" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "sslMode" TEXT NOT NULL DEFAULT 'prefer',
    "schemaName" TEXT NOT NULL DEFAULT 'public',
    "tableName" TEXT NOT NULL DEFAULT 'jira_kpi_results',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MetabaseConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "apiKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GermanHolidayConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'national',
    "holidayDate" DATETIME NOT NULL,
    "holidayName" TEXT NOT NULL,
    "isFullHoliday" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
