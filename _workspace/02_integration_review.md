# Integration QA Report

Generated: 2026-05-28 | Evaluator: evaluator-active (Integration QA)

## Summary

- **Total issues found**: 15
- **Critical: 3** | High: 3 | Medium: 5 | Low: 4
- **API routes reviewed**: 25
- **Contract mismatches found**: 5
- **Overall Verdict**: FAIL (Critical issues present)

---

## Critical Integration Issues

### C1: TicketSnapshot Missing `rawData` Column — Data Loss on Latest Extraction Path

**Files**:
- `prisma\schema.prisma` lines 37-59 (TicketSnapshot model — no `rawData` field)
- `src\app\api\jira\extract\latest\[connectionId]\route.ts` line 42 (`snapshot.rawData`)
- `src\app\api\jira\extract\route.ts` lines 222-243 (creates snapshot records without `rawData`)

**Details**: The `TicketSnapshot` Prisma model defines 14 columns (id, etlRunId, jiraKey, summary, issueType, priority, status, assignee, reporter, created, updated, resolved, dueDate, storyPoints, labels, components) but does NOT include a `rawData` column. The `latest/[connectionId]` route (line 42-51) tries to access `snapshot.rawData` to extract custom fields (`customfield_*` values). Since the column does not exist, `snapshot.rawData` is always `undefined`, and the custom field fallback logic silently produces empty objects. All user-defined custom fields (including `issueOwnerTeam`) are lost when loading issues via the latest extraction path.

**Impact**: Custom field data is silently dropped for all users loading data through the latest extraction path. The UI shows reconstructed issues with missing custom fields, producing inaccurate KPI calculations and display.

**Fix**: Add a `rawData String?` column to the `TicketSnapshot` model, regenerate the Prisma client, and populate it during extraction in `src\app\api\jira\extract\route.ts` (the `snapshotData` mapping at line 222-243).

---

### C2: API Route References Non-Existent `jiraConnection` Database Table

**Files**:
- `src\app\api\jira\test-issue\route.ts` line 18 (`(db as any).jiraConnection.findUnique`)
- `prisma\schema.prisma` (no `jiraConnection` model exists)

**Details**: The `/api/jira/test-issue` POST handler attempts to look up connection credentials from a `jiraConnection` table via `(db as any).jiraConnection.findUnique({ where: { id: connectionId } })`. However, the Prisma schema has no `JiraConnection` model. Connections are managed entirely in `localStorage` on the client side (via `src/lib/config/local-store.ts`). A call to this endpoint with a valid `connectionId` will either throw a Prisma error or return undefined, causing a 404 response every time.

**Impact**: The `/api/jira/test-issue` endpoint is completely non-functional. Any code path that depends on this endpoint for fetching a specific Jira issue fails with a 404.

**Fix**: Either add a `JiraConnection` model to the Prisma schema, or modify the route to accept credentials directly from the request body (like the `/api/jira/extract` route does).

---

### C3: TicketSnapshot Missing `issueOwnerTeam` Column — Team-Based KPIs Broken on Latest Extraction

**Files**:
- `prisma\schema.prisma` line 53 (`assignee` is present, `issueOwnerTeam` is absent)
- `src\app\api\jira\extract\latest\[connectionId]\route.ts` line 54 (`(snapshot as any).issueOwnerTeam`)
- `src\app\api\jira\extract\route.ts` lines 222-243 (snapshot creation — no `issueOwnerTeam` field)
- `src\lib\kpi\types.ts` line 215 (`issueOwnerTeam: string | null` on `TransformedIssue`)

**Details**: Compared to the `MasterTicket` model (which has `issueOwnerTeam String?`), the `TicketSnapshot` model lacks this column. The latest extraction route line 54 attempts `(snapshot as any).issueOwnerTeam`, which is always `undefined`. The `issueOwnerTeam` field is critical for team-based KPI plugins like `open-tickets-by-issue-owner-team` and the `open-tickets-by-assignee-weekly` time-series plugin.

**Impact**: Team-based KPIs (Issue Owner Team aggregation) produce "Unassigned" for all tickets loaded from the latest extraction path, producing incorrect team-level metrics.

**Fix**: Add `issueOwnerTeam String?` to the `TicketSnapshot` model and populate it during extraction (the `extractSelectFieldValue` call already exists in master ticket creation at line 308-310 of extract/route.ts but is omitted from snapshot creation at lines 222-243).

---

## High Integration Issues

### H1: API Response Format Inconsistency in `/api/export/file`

**Files**:
- `src\app\api\export\file\route.ts` line 9 (`{ error: 'Issues array is required' }` without `success: false`)
- `src\lib\api-error.ts` lines 72-77 (standard error format: `{ success: false, error: ..., details?: ..., stack?: ... }`)
- `src\app\api\export\file\route.ts` line 84 (`{ error: error.message }` without `success: false`)

**Details**: Every other API route in the codebase uses the standard `{ success: false, error: "..." }` wrapper format (defined in `api-error.ts`). The `/api/export/file` route returns `{ error: "..." }` (no `success: false`) for all error conditions. The frontend `ExportPanel` at line 91-96 does not validate `data.success` before processing — it simply calls `await exportRes.blob()` after checking `exportRes.ok`. On success, the response returns a CSV blob (not JSON), which means even the `exportRes.ok` check is ambiguous since a JSON error with 200 status would also pass `res.ok`.

**Impact**: Error messages from this endpoint may not be properly displayed to users since the frontend code does not parse error JSON at all for KPI exports (it directly reads a blob). JSON parse errors in the API return CSV content, which the frontend treats as valid data.

**Fix**: Standardize error responses to use `{ success: false, error: "..." }` format. Update the frontend to check response content-type before consuming as blob.

---

### H2: Webhook Route Uses Default Database — Ignores Connection-Specific Storage Config

**Files**:
- `src\app\api\webhooks\jira\route.ts` lines 1-2 (`import { db as prisma } from '@/lib/db'`)
- `src\lib\db.ts` line 248-250 (proxy `db` always returns `getDefaultDb()`)
- `src\app\api\jira\extract\route.ts` line 41 (`const db = getDb(storageConfig)` — explicit config passing)

**Details**: The webhook route uses `import { db } from '@/lib/db'` which always resolves to the default SQLite database (via `DATABASE_URL` env var). It never reads `storageConfig` from the request (unlike nearly every other POST endpoint). This means all webhook data is written ONLY to the default SQLite database. If a user has configured a PostgreSQL backend for their extraction data, the webhook will write to the wrong database.

**Impact**: In multi-database configurations, webhooks silently write to the wrong database. The master dataset the user views (on PostgreSQL) will not include webhook updates.

**Fix**: Modify the webhook route to accept and respect `storageConfig` in the request body, using `getDb(storageConfig)` instead of the default proxy.

---

### H3: `/api/webhooks/jira` Inconsistent Error Response Format

**Files**:
- `src\app\api\webhooks\jira\route.ts` line 35 (`{ error: 'Invalid payload: No issue data' }` without `success: false`)
- `src\app\api\webhooks\jira\route.ts` line 102 (`{ error: 'Internal server error' }` without `success: false`)
- `src\app\api\webhooks\jira\route.ts` line 12 (`{ success: false, error: 'Missing connectionId' }` — correct format)

**Details**: The route alternates between correct `{ success: false, error: "..." }` format (lines 12, 19, 26) and incorrect `{ error: "..." }` format (lines 35, 102). This inconsistency means the receiving system (Jira's webhook delivery) gets different response shapes for different error types, complicating automated monitoring.

**Impact**: Automated webhook monitoring tools expecting consistent response shapes may misinterpret error responses. Not all errors can be distinguished by their shape.

**Fix**: Normalize all error responses to use `{ success: false, error: "..." }` format.

---

## Medium Integration Issues

### M1: useKpiCalculations Hook Does Not Send `settings` to KPI Calculate API

**Files**:
- `src\hooks\useKpiCalculations.ts` lines 87-101 (request body — no `settings` field)
- `src\app\api\kpi\calculate\route.ts` lines 9-15 (destructures `settings`, `slaTargets`, `holidays`, `activePluginIds` from body)
- `src\store\app-store.ts` lines 38-39 (settings exist in store but are not sent)

**Details**: The `useKpiCalculations` hook sends `{ activeConnectionId, connectionId, storageConfig, dateFrom, dateTo, region, globalFilters, customWidgets }` but omits `settings` entirely. The API route (`/api/kpi/calculate`) uses `settings` to determine SLA targets, holiday configuration, work hours, and the `useAnyoneCommentsForSla` flag. Without this data, the API falls back to defaults (9-17 work hours, 40-hour SLA, no region-specific holidays). Since the store has `settings` available (line 70: `const settings = useAppStore((state) => state.settings)`), this appears to be an oversight.

**Impact**: KPI calculations triggered from the dashboard UI use default work hours and SLA targets instead of user-configured values. Holiday calendar settings are ignored.

**Fix**: Add `settings` to the request body in `fetchKpiCalculations` at line 92-101 in `useKpiCalculations.ts`.

---

### M2: Missing Middleware — No Route Protection

**Files**:
- (File not found — no `src/middleware.ts` exists)
- `src\app\api\jira\extract\cleanup\route.ts` (accepts DELETE-like operations via POST, no CSRF protection)

**Details**: The project has no `middleware.ts` file. While this is a local-first desktop application, running it as a Next.js dev server on `localhost:3000` makes all routes accessible from any origin if the user has network access. There are no CSRF tokens, no origin checks, and no rate limiting applied at the middleware level (the `checkRateLimit` in `api-error.ts` is never invoked by any route handler).

**Impact**: Routes like `/api/jira/extract/cleanup` (which deletes data) are vulnerable to CSRF attacks if the application is exposed beyond localhost. The webhook endpoint has no IP allow-listing.

**Fix**: Add `src/middleware.ts` with at minimum: CSRF protection for mutation endpoints, origin validation, and proper Content-Type checking. Apply rate limiting at the middleware level.

---

### M3: Extract API Route and Latest Extraction API Have Divergent Issue Reconstruction Logic

**Files**:
- `src\app\api\jira\extract\latest\[connectionId]\route.ts` lines 41-91 (reconstruction from TicketSnapshot)
- `src\app\api\jira\master\[connectionId]\route.ts` lines 67-112 (reconstruction from MasterTicket)

**Details**: Both routes reconstruct Jira-shaped issue objects from database records, but they use slightly different logic. The Master API (line 69) tries `JSON.parse(ticket.rawData)` first if `includeRawData` is true. The Latest extraction API (line 42) falls back to `JSON.parse(snapshot.rawData)` which is always undefined (see C1). The `resolutiondate` fallback logic also differs: Master API sets `null` for unresolved tickets, while Latest extraction API sets a synthetic resolution date for "done-like" statuses (line 72-73).

**Impact**: KPI calculations produce different results depending on which data source path is used (latest extraction vs. master dataset). Resolved ticket counts and cycle time calculations diverge.

**Fix**: Extract the reconstruction logic into a shared utility function. Ensure both paths produce identical issue shapes.

---

### M4: State Flow Gap — Extraction Does Not Invalidate KPI Cache

**Files**:
- `src\components\dashboard\ExtractPanel.tsx` lines 242-353 (`handleExtract` function)
- `src\hooks\useKpiCalculations.ts` lines 160-172 (React Query with `staleTime: Infinity`)
- `src\app\page.tsx` lines 25-32 (QueryClient config)

**Details**: When the user extracts new Jira issues, the `ExtractPanel.handleExtract` function calls the extract API, then reloads the master dataset, and optionally pings the poll system. However, it does NOT invalidate the KPI calculation query cache. The `useKpiCalculations` hook uses `staleTime: Infinity` and `gcTime: Infinity` (lines 167-168), meaning once loaded, KPI results are never refreshed until the user manually triggers a recalculation.

**Impact**: After extraction, the dashboard shows stale KPI data until the user manually recalculates. There is no automatic invalidation of the KPI query cache when new data is extracted.

**Fix**: Use `queryClient.invalidateQueries({ queryKey: ['kpi-results'] })` after a successful extraction in `ExtractPanel.handleExtract`.

---

### M5: `ExportPanel` KPI Export Handles Blob Without Error Checking

**Files**:
- `src\components\dashboard\ExportPanel.tsx` lines 91-107
- `src\app\api\export\file\route.ts` lines 4-88

**Details**: The `exportData` function (line 91-107) calls `/api/export/file`, checks `!exportRes.ok`, then calls `await exportRes.blob()`. If the API returns a JSON error with HTTP 200 (possible due to the formatting issue in H1), `exportRes.ok` passes. The code then creates a blob from JSON and downloads it as a CSV file. The user receives a corrupted file containing JSON error text instead of actual CSV data. There is no content-type validation on the response.

**Impact**: Users may download files containing JSON error messages thinking they are valid KPI export data.

**Fix**: Check `response.headers.get('content-type')` before consuming as blob. Parse JSON and check `data.success` for non-CSV responses.

---

## Low Integration Issues

### L1: Electron `preload.js` Exposes Only `platform` and `versions` — No IPC Channels

**Files**:
- `electron\preload.js` lines 1-8
- `electron\main.js` lines 1-49

**Details**: The preload script exposes only `window.electronAPI = { platform, versions }`. There are no IPC channels registered for file operations, Jira connections, or database access. A grep for `window.electronAPI` across the entire `src/` directory returns zero results. The Electron wrapper is purely cosmetic — it renders the web app in a BrowserWindow with no desktop integration whatsoever. The `nodeIntegration: false` and `contextIsolation: true` settings are correctly configured for security, but there are no IPC handlers to bridge main process capabilities to the renderer.

**Impact**: The Electron app provides no value beyond what the browser already offers. There is no native file save dialog, no system tray integration, no auto-start capability.

**Fix**: Either add meaningful IPC channels (file export, notifications) or document that Electron is a thin wrapper with no desktop integration.

---

### L2: `TicketSnapshot` Missing `firstSeenAt` and `lastUpdatedAt` Timestamps

**Files**:
- `prisma\schema.prisma` lines 37-59 (TicketSnapshot — missing timestamp metadata)
- `prisma\schema.prisma` lines 121-122 (MasterTicket has `firstSeenAt` and `lastUpdatedAt`)

**Details**: The `MasterTicket` model has `firstSeenAt` and `lastUpdatedAt` metadata columns for tracking data freshness, but `TicketSnapshot` lacks them entirely. While snapshots are tied to ETL runs (which have `startedAt`/`completedAt`), individual snapshot-level timestamps would enable finer-grained audit trails.

**Impact**: Cannot determine when a specific snapshot was first or last updated without joining to the parent ETL run.

**Fix**: Consider adding `createdAt` and `updatedAt` timestamps to `TicketSnapshot` for audit purposes.

---

### L3: `KpiResult` Model Has No `storageConfig` Column — Cross-Database Portability Issue

**Files**:
- `prisma\schema.prisma` lines 73-92

**Details**: The `KpiResult` model stores KPI calculations with a `connectionRef` (localStorage-based connection identifier) but no database provider reference. If multiple database backends are used (SQLite + PostgreSQL), there is no way to determine which database a `KpiResult` belongs to without joining to `EtlRun`. The `EtlRun` is optional (`etlRunId String?`), so orphaned KPI results are always ambiguous.

**Impact**: In multi-database setups, orphaned KPI results (where `etlRunId` is null) cannot be associated with their source database.

**Fix**: Add a `storageProvider String?` or `dbHash String?` column for disambiguation.

---

### L4: `ChartConfig` Type Has No `timeSeries` Visualization Hint

**Files**:
- `src\types\dashboard.ts` line 43 (`type: 'bar' | 'line' | 'pie' | 'area'`)
- `src\lib\kpi\types.ts` line 124 (`visualization?: 'card' | 'horizontal_bar' | 'pie' | 'line' | 'list'`)

**Details**: The `ChartConfig` type supports only 4 chart types (bar, line, pie, area) but the KPI plugin system defines additional visualization types like 'card', 'horizontal_bar', and 'list'. The KPI dashboard component uses `getRecommendedChartType` (from `chart-data-utils.ts`) to map plugin types, but plugins with `visualization: 'card'` always get mapped to a bar chart unnecessarily.

**Impact**: Plugin visualization type hints are partially ignored. Simple card KPIs may display as bar charts.

**Fix**: Extend the `ChartConfig.type` to include `'card' | 'list'` or add a separate `visualization` field.

---

## API-Frontend Contract Audit

| API Route | Frontend Consumer | Status | Notes |
|-----------|------------------|--------|-------|
| `/api/jira/test` | `ConnectionsPanel.tsx` | PASS | Contract consistent; both sides handle `success: boolean` |
| `/api/jira/test-issue` | Unknown | **FAIL** | References non-existent `jiraConnection` table (C2) |
| `/api/jira/extract` | `ExtractPanel.tsx` | PASS | Full contract; `safeJson` helper handles malformed responses |
| `/api/jira/extract/latest/[connectionId]` | Unknown (not in UI scan) | **FAIL** | Reads `TicketSnapshot.rawData` which doesn't exist (C1) |
| `/api/jira/extract/cleanup` | Unknown (not in UI scan) | PASS | Clean contract; proper validation |
| `/api/jira/extract/storage` | `StoragePanel.tsx` | PASS | Contract consistent |
| `/api/jira/master/[connectionId]` | `ExtractPanel.tsx`, `page.tsx` | PASS | POST(action: get/delete); frontend handles both |
| `/api/jira/fields/suggest` | `ExtractPanel.tsx` | PASS | Proper credential passthrough |
| `/api/jira/poll` | `ExtractPanel.tsx` | PASS | GET for status, POST for config; sanitized response |
| `/api/kpi/calculate` | `useKpiCalculations.ts` | **PASS with gap** | Hook omits `settings` from body (M1) |
| `/api/kpi/plugins` | `KpiDashboard.tsx` | PASS | Clean GET contract |
| `/api/kpi/plugins/custom` | `PluginsPanel.tsx` | PASS | Full CRUD; path traversal sanitization present |
| `/api/kpi/plugins/events` | `useKpiCalculations.ts` (via polling) | PASS | Event counter pattern is clear |
| `/api/dashboard/views` | `ViewManager.tsx` | PASS | GET/POST with connectionRef filter |
| `/api/dashboard/views/[id]` | `ViewManager.tsx` | PASS | PATCH/DELETE; transactional default handling |
| `/api/dashboard/views/[id]/default` | `ViewManager.tsx` | PASS | POST to set default; DELETE to clear |
| `/api/dashboard/views/bulk` | `SettingsPanel.tsx` (config export) | PASS | GET all views; POST bulk import |
| `/api/holidays` | `HolidaysPanel.tsx` | PASS | Clean query parameter contract |
| `/api/export/file` | `ExportPanel.tsx` | **FAIL** | Inconsistent error format; no content-type check (H1, M5) |
| `/api/pg/export` | `ExportPanel.tsx` | PASS | Contract consistent |
| `/api/pg/test` | Unknown (Storage settings) | PASS | SSRF protection present |
| `/api/webhooks/jira` | External (Jira) | **FAIL** | Inconsistent error format (H3); uses default DB (H2) |
| `/api/debug/health` | Monitoring | PASS | Clear HealthResponse contract |
| `GET /api` (root) | Health check | PASS | Simple hello-world response |

**Contract mismatches: 5 / 25 routes reviewed (20% mismatch rate)**

---

## ETL Pipeline Flow Audit

### Jira API to Prisma to KPI to Dashboard Trace

**Step 1: Jira API Fetch** (`src/lib/jira/client.ts`)
- `JiraClient.extractIssues(jql, options)` returns `JiraIssue[]` with fields: key, summary, issuetype.name, priority.name, status.name, assignee.displayName, reporter.displayName, created, updated, resolutiondate, duedate, changelog.histories, custom fields
- Type: `JiraIssue` interface (client.ts lines 13-35) — structurally sound, optional fields properly typed

**Step 2: Transformation to Snapshot** (`src/app/api/jira/extract/route.ts` lines 222-243)
- Flattens `JiraIssue.fields.*` into `TicketSnapshot` columns
- **DATA LOSS**: Does NOT store `issueOwnerTeam`, `rawData`, or custom field IDs beyond `storyPointsFieldKey`
- Labels/components serialized as JSON strings
- Transitions stored separately in `TicketTransition` table

**Step 3: Master Ticket Upsert** (`src/app/api/jira/extract/route.ts` lines 292-362)
- Stores full `rawData` (complete Jira issue JSON) in `MasterTicket`
- Stores `issueOwnerTeam` via `extractSelectFieldValue`
- Batch upsert in single transaction — correct O(1) lock acquisition
- Deletion detection logic present (lines 366-405)

**Step 4: KPI Calculation** (`src/lib/kpi/engine.ts`)
- `KpiEngine.calculateAll()` loads `MasterTicket.rawData`, parses to `JiraIssue[]`
- Applies global filters via `FIELD_ACCESSORS` map (efficient O(1) lookup)
- Transforms each `JiraIssue` to `TransformedIssue` via `transformIssueForKpi` (engine-utils.ts line 30)
- Passes `TransformedIssue[]` to plugin `calculate()` functions

**Step 5: Dashboard Display** (`src/components/dashboard/KpiDashboard.tsx`)
- Results flow: `useKpiCalculations` hook calls `/api/kpi/calculate` -> Zustand store -> `KpiDashboard` renders
- Each KPI result is rendered as `KpiCard` or `ChartCard` component
- Drill-down and period analysis hooks add interactivity

**Pipeline Data Shape Consistency**: PASS for MasterTicket path. **FAIL for Latest Extraction path** due to missing `TicketSnapshot.rawData`.

---

## Routing & Navigation Audit

- **Page routes**: Single page (`src/app/page.tsx`) with tab-based SPA navigation — no router-based routing
- **Dynamic route segments**: `[connectionId]` in `/api/jira/master/[connectionId]/route.ts` and `/api/jira/extract/latest/[connectionId]/route.ts` — both correctly use `params: Promise<{ connectionId: string }>` pattern (Next.js 16 async params)
- **Query parameters**: Well-validated across routes (`holidays`, `dashboard/views`, `kpi/plugins/custom`)
- **Link components**: No static `<Link>` components exist — all navigation is via `setActiveTab` state
- **`useParams()` usage**: Not used in client components (only in route handlers)
- **Middleware**: MISSING — `src/middleware.ts` does not exist

---

## State Flow Verification

### Prisma-Zustand-TanStack-Query-UI Chain

| Data Flow | Status | Notes |
|-----------|--------|-------|
| Extraction -> Prisma write | PASS | Chunked processing with transaction fallback |
| Prisma -> Master Dataset load | PASS | `page.tsx` auto-loads on connection change |
| Master Dataset -> Zustand store | PASS | `setMasterDatasetInfo` persists to store |
| Extraction -> KPI calculate | PASS | Triggered inline in extract route (lines 407-490) |
| KPI calculate -> Zustand store | PASS | Via `useKpiCalculations` hook effect (line 177-181) |
| Zustand -> Dashboard UI | PASS | Direct store selectors in KpiDashboard |
| Dashboard view save -> Prisma | PASS | `POST /api/dashboard/views` with transactional defaults |
| Dashboard view load -> Zustand | PASS | ViewManager loads active view into store |
| Cache invalidation on mutation | **FAIL** | Extraction does not invalidate KPI query cache (M4) |
| TanStack Query staleTime | **WARN** | `staleTime: Infinity` blocks automatic refresh |

---

## Component Integration Issues

- **Props flow**: All major components (ExtractPanel, KpiDashboard, ExportPanel, ConnectionsPanel) access `useAppStore()` directly rather than receiving props. This is architecturally consistent.
- **Context providers**: `QueryClientProvider` wraps the entire app at `page.tsx` line 302. No other React Contexts detected.
- **Import consistency**: All imports use `@/` path alias. No circular dependencies detected in quick scan.
- **Component tree**: `Home -> TabsContent -> ExtractPanel | KpiDashboard | ConnectionsPanel | SettingsPanel | StoragePanel | HolidaysPanel | PluginsPanel | ExportPanel` — flat hierarchy, no deep nesting issues.

---

## Form Submission Flow Issues

- **No traditional forms**: The application uses `onClick` handlers on buttons with direct `fetch()` calls. No `<form onSubmit>`, no Server Actions, no react-hook-form.
- **Validation**: Client-side validation is minimal (mostly `if (!activeConnectionId) { toast.error(...); return }` checks). Server-side validation is present in API routes (required field checks, `safeJson` wrapper for malformed JSON).
- **Loading states**: Consistently handled via `useState(loading)` booleans with `Loader2` spinner UI.
- **Error display**: Uses `toast.error()` from sonner for user-facing errors. Console logging for development.

---

## Recommendations Summary (Priority-Ordered)

1. **[CRITICAL]** Add `rawData String?` and `issueOwnerTeam String?` columns to `TicketSnapshot` Prisma model. Run `prisma generate`. Populate both during extraction in `src/app/api/jira/extract/route.ts`. (C1, C3)
2. **[CRITICAL]** Fix `/api/jira/test-issue` route: either add `JiraConnection` Prisma model or accept credentials directly from request body. (C2)
3. **[HIGH]** Standardize error response format in `/api/export/file` and `/api/webhooks/jira` to use `{ success: false, error: "..." }` wrapper. Add content-type validation in ExportPanel. (H1, H3)
4. **[HIGH]** Add `storageConfig` support to webhook route so data writes to the correct database backend. (H2)
5. **[MEDIUM]** Add `settings` to the request body in `useKpiCalculations.fetchKpiCalculations` so configured SLA targets and work hours are used. (M1)
6. **[MEDIUM]** Add `queryClient.invalidateQueries({ queryKey: ['kpi-results'] })` after successful extraction in `ExtractPanel.handleExtract`. (M4)
7. **[MEDIUM]** Create `src/middleware.ts` with CSRF protection for mutation endpoints. (M2)
8. **[MEDIUM]** Extract issue reconstruction logic into a shared utility function used by both `master/[connectionId]` and `latest/[connectionId]` routes. (M3)
9. **[MEDIUM]** Add content-type validation in `ExportPanel.exportData` before consuming response as blob. (M5)
10. **[LOW]** Add meaningful IPC channels to the Electron app or document the thin-wrapper limitation. (L1)
11. **[LOW]** Add `createdAt`/`updatedAt` timestamps to `TicketSnapshot` for audit trail. (L2)
12. **[LOW]** Add `storageProvider` column to `KpiResult` for multi-database disambiguation. (L3)
13. **[LOW]** Extend `ChartConfig.type` to include `'card'` and `'list'` visualization types. (L4)

---

**Overall Verdict**: FAIL — 3 critical integration bugs (C1, C2, C3) prevent core functionality and cause silent data loss.
