# Future Plan: Data Migration between Storage Backends

This document outlines the strategy for migrating extracted Jira data and KPI results between different storage providers (e.g., from local SQLite to PostgreSQL/Supabase).

## Objective
Enable users to seamlessly move their existing extraction history and calculated KPIs when switching primary storage engines, ensuring no data loss during infrastructure transitions.

## Architecture

### 1. Migration Endpoint
A new API route `/api/storage/migrate` will be created to handle the transfer.

- **Method**: `POST`
- **Payload**:
  ```json
  {
    "source": { "provider": "sqlite", "url": "" },
    "target": { "provider": "postgresql", "url": "..." },
    "options": {
      "overwrite": false,
      "deleteSource": false,
      "tables": ["JiraIssue", "KpiResult", "JiraSyncLog"]
    }
  }
  ```

### 2. Execution Logic
1. **Initialize Clients**: Open Prisma clients for both source and target URLs.
2. **Batch Fetch**: Stream data from the source database in chunks (e.g., 500 records at a time) to avoid memory overflow.
3. **Transformation**: Ensure that ID conflicts are handled (using `upsert` or checking existence).
4. **Batch Insert**: Use `createMany` (where supported) or individual `upsert` calls to populate the target database.
5. **Validation**: Compare record counts between source and target for each table.

## Implementation Steps

### Phase 1: Preparation
- [ ] Add `getDb(url)` utility to support multiple simultaneous connections (Done).
- [ ] Implement `migrate` command in the CLI for server-side execution.

### Phase 2: API Development
- [ ] Create `/api/storage/migrate` route.
- [ ] Implement `migrateTable(sourceClient, targetClient, tableName)` helper.
- [ ] Add progress tracking (SSE or Polling) so the UI can show a progress bar.

### Phase 3: Frontend Integration
- [ ] Add a "Migrate to this Storage" button in the `StoragePanel` for inactive backends.
- [ ] Create a migration wizard modal to select source, target, and options.
- [ ] Add logs and success/failure reporting.

## Constraints & Considerations
- **Prisma Client Generation**: Since both databases share the same schema, a single Prisma client can handle both, provided the `datasources` URL is swapped dynamically.
- **Vercel Timeouts**: Migrating large datasets (>10k tickets) may exceed Vercel's 10-60s function limit. For large migrations, suggest running the dashboard locally or using a background job worker (e.g., Inngest or QStash).
- **SQLite Limitations**: When migrating *from* SQLite, ensure the file is accessible to the process (works locally, but not if the app is already on Vercel).
