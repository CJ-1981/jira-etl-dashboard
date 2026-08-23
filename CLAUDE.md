# Jira ETL Dashboard — Development Guide

Guidance for AI coding agents and developers working in this repository.

## Project Overview

A single-page Next.js dashboard that extracts ticket data from Jira (Cloud or Server), calculates business-hour KPIs (German-holiday-aware), and exports results to CSV/JSON or PostgreSQL (Metabase/Supabase). Packaged as a portable standalone app (caxa) for Windows/macOS.

**Tech stack:** Next.js 16 (App Router, standalone output), React 19, TypeScript, Prisma 6 (dual SQLite/PostgreSQL clients), TanStack React Query, Zustand, shadcn/ui + Tailwind CSS 4, Recharts, Vitest + Playwright. Node >= 20.9 required (`engines` enforced); see `.env.example` for all environment variables.

## Commands

```bash
npm run dev            # Dev server on port 3000 (runs prisma-setup first via predev)
npm run build          # Production build → .next/standalone
npm start              # Run standalone production server
npm test               # Vitest (run mode: npx vitest run)
npm run test:coverage  # v8 coverage — enforces ratchet thresholds (70% lines), fails below
npm run lint           # ESLint (critical rules re-enabled; 1087 pre-existing warnings, threshold 2000)
npm run type-check     # tsc --noEmit — ALWAYS run this before committing
npm run e2e            # Playwright e2e (reuses a running dev server locally; boots one in CI)
npm run db:push        # Push schema to SQLite (default DATABASE_URL)
npm run db:push:pg     # Push PostgreSQL schema (prisma/schema.postgresql.prisma)
npm run db:studio      # Prisma Studio
build-exe.bat          # Windows portable exe (caxa); build-exe.sh for macOS
```

CI runs `test:coverage`, `lint --max-warnings=2000`, and `type-check` on push/PR to main/develop (Node 22). E2E is not wired into CI yet.

**Quality gates:** a `pre-push` hook runs the same CI trio locally before every push (installed automatically on `npm install` via `scripts/hooks/install-hooks.mjs`, or manually with `npm run hooks:install`; bypass with `git push --no-verify`). The release workflow additionally waits for the CI run of the tagged commit to finish and aborts the release if it is red — so tagging cannot outrun CI.

## Architecture

### Single page + API routes
The UI is one page (`src/app/page.tsx`, tabbed panels under `src/components/dashboard/`). All data flows through ~20 API routes under `src/app/api/`:

- `jira/extract` — core ETL: JQL pull → `EtlRun` + `TicketSnapshot`/`TicketTransition` + `MasterTicket` upserts → KPI calculation → `KpiResult` storage. The run row starts as `extracting` and is promoted to `completed` only after the load succeeds (`failed` + errorLog on crash); old-run pruning happens after success. Deletion detection is conservative: it only runs for the app-generated broad-sync JQL, never for user-provided custom JQL.
- `jira/poll` — server-side background polling scheduler (keeps credentials in `globalThis` state)
- `jira/connections/[connectionId]` — DELETE: cascades all of a connection's data (KPI results, dashboard views, transitions, snapshots, runs, master tickets) in one transaction
- `kpi/calculate` — KPI engine entry point; the UI calls this, there is no client-side calculation
- `kpi/plugins/custom` — CRUD for user plugins (writes `.ts` files, requires restart)
- `dashboard/views` — saved views persisted in the DB (`DashboardView` model); at most one default view per connection, enforced transactionally (including bulk import)
- `pg/export`, `pg/test`, `webhooks/jira`, `holidays`, `export/file`, `debug/health`

**Cross-origin protection:** every mutating endpoint rejects requests whose
`Origin`/`Referer` header points outside loopback (401) — all POST/PATCH/PUT/DELETE
handlers under `src/app/api/` are guarded (views CRUD, bulk import, extract, cleanup,
master delete, poll, kpi/calculate, custom plugins CRUD, pg/export, webhooks).
Header-less requests (server-side fetch, curl) pass. When adding a new mutating route,
copy the `isLoopbackOriginRequest` guard from `kpi/calculate/route.ts`. The webhook
route composes a stricter variant (`isWebhookLoopbackRequest`) that additionally
requires BOTH headers to be loopback and http(s) only.

### Dual Prisma storage (read this before touching `src/lib/db.ts`)
- Source schemas: `prisma/schema.sqlite.prisma` and `prisma/schema.postgresql.prisma`.
  **Never edit `prisma/schema.prisma` directly** — it is rewritten by `scripts/prisma-setup.mjs`
  (runs automatically on `postinstall`, `predev`, `prebuild`) based on `DATABASE_URL`.
- Generated clients live in `prisma/generated/{sqlite,postgresql}` (gitignored).
- `getDb(config)` returns a cached client (LRU, max 10) with SSRF host validation
  (localhost + Supabase only). Default DB: `DATABASE_URL` env or `file:./db/custom.db`.
- The exported `db` object only has a `.client` getter. Access models via
  `db.client.masterTicket...`, `getDefaultDb()`, or `getDb(...)` — **not** `db.masterTicket`.
  (The webhook and health routes were previously broken this way and now use `getDefaultDb()`.)
- `prisma/migrations/` reproduces the full current schema (`prisma migrate deploy` verified on a
  fresh DB). Day-to-day local SQLite is still applied via `prisma db push` in `scripts/prisma-setup.mjs`.

### KPI engine & plugins
- Engine singleton: `src/lib/kpi/engine.ts` (`getKpiEngine()`); helpers in `engine-utils.ts`.
- 33 plugins registered statically in `src/lib/kpi/plugin-loader.ts`:
  24 in `plugins/builtin/{processing-time,sla,turnaround,throughput,quality,assignee}`,
  9 in `plugins/time-series/...`. To add a built-in plugin: create the file, import and
  register it in `plugin-loader.ts`.
- **Custom formulas are sandboxed** (`src/lib/kpi/custom-formula.ts`): the old
  `new Function(...)` compiler was replaced by a parser + tree-walking interpreter.
  DSL (`COUNT/AVG/SUM/PERCENTAGE` with `WHERE`/`CONTAINS`/comparisons) is fully supported;
  `javascript` plugins must be a **single expression** (no statements) using an allow-list of
  methods — `String.match` is deliberately NOT available (ReDoS), and unrecognized DSL
  conditions throw instead of silently matching everything. Engine results are sanitized at
  the boundary (finite numbers, string names/units only). See `custom_plugin_guide.md`.
- Runtime-loaded custom plugins come from `data/custom-plugins/` (or `CUSTOM_PLUGIN_DIR` env).
  The loader, the file watcher, and the custom-plugin API all resolve this path through
  `getCustomPluginDir()` in `src/lib/kpi/plugin-paths.ts` — keep them aligned by always using
  that helper rather than hardcoding a directory. Plugins uploaded via the API are written to
  disk but only activate on server restart (the engine registers custom plugins at startup).
- `transformIssueForKpi` preserves the raw Jira `changelog` on transformed issues because
  `reassignment_count` needs assignee-change history that status-only `transitions` cannot
  represent — don't strip it.
- All time-based KPIs use business-hour math from `src/lib/holidays/german-holidays.ts`
  (all 16 German states; configured per connection in `data/settings.json` defaults).

### Where configuration lives
- **Jira connections, Postgres connections, app settings, dashboard state: browser
  `localStorage`** via `src/lib/config/local-store.ts` — there is no `JiraConnection` table
  in the current schema (older code/comments may suggest otherwise).
- Runtime defaults: `data/settings.json` (tracked in git — work hours, SLA targets, retention).
- Server env: `.env` (`DATABASE_URL`, `JIRA_WEBHOOK_SECRET`, …) — untracked, never commit it.
  `.env.example` documents every supported variable (legacy `NEXTAUTH_*`/`ADMIN_*` vars are
  listed but unused — no auth is implemented).

### Code annotation convention (MX tags)
The codebase uses `@MX:` comment tags; follow the same style in significant changes:
- `@MX:NOTE` — intent/context explanation
- `@MX:WARN` + `@MX:REASON` — danger zone / invariant that must not be broken casually
- `@MX:ANCHOR` + `@MX:REASON` — high fan-in contract point
- `@MX:TODO` — known incomplete work

## Gotchas & Known Issues

1. **Build enforces type errors** — `next.config.ts` sets `typescript.ignoreBuildErrors: false`
   and ESLint has critical rules re-enabled (`no-explicit-any`, `no-unused-vars`, `no-debugger`,
   `no-fallthrough`, `no-unreachable`, etc.). `npm run type-check` and `npm run lint` are both
   real static gates. The lint warning threshold is 2000 (ratchet) — lower it as the codebase
   is cleaned up.
2. **`REACT_APP_*` env vars do nothing** — leftover CRA convention in
   `src/lib/jira/field-config.ts`; Next.js does not expose them.
3. **All KPI math runs server-side** via `/api/kpi/calculate` — there is no Web Worker
   (a former `kpi-worker.ts` was dead code and has been deleted). Don't build features
   assuming client-side calculation exists.
4. **Custom plugin upload = server-side file write** into the custom-plugin directory
   (`data/custom-plugins/`) with the plugin's `calculate` body interpolated, activated at
   restart. Formula execution itself is sandboxed (see KPI engine section), but the file-write
   surface remains — never expose this app untrusted on a network.
5. **Electron path is abandoned/broken** — `electron/main.js` loads `../out/index.html`, but
   no `output: 'export'` build exists (production is `standalone`). The caxa pipeline
   (`build-exe.*` + `launcher.cjs`) is the real distribution path.
6. **Jira custom field IDs** — `transformIssueForKpi` in `src/lib/kpi/engine-utils.ts`
   accepts an optional `fieldMapping` parameter and uses `JIRA_FIELD_MAP` defaults
   (the legacy `transformIssue` in `jira/client.ts` was deleted as dead code). However,
   `customfield_10002`, `customfield_10132`, `customfield_10020`, `customfield_10014/10016`
   are still hardcoded as defaults in `JIRA_FIELD_MAP` and `field-config.ts` — check both when
   changing field handling.
7. **Port handling** — dev is pinned to 3000. All production launchers scan **3200–3299**
   for a free port (`launcher.cjs` for the caxa exe, generated launchers for the portable
   folder builds); set `PORT` to force a specific port. `launcher.cjs` binds 127.0.0.1
   unless `HOSTNAME` is set explicitly (the app has no auth — keep it loopback-only).
8. **Existing dev DB has an orphaned migration record** (`20260528000000_add_ticket_snapshot_rawdata_owner_team`,
   applied but its file is not in the repo). `prisma migrate deploy` therefore fails on the
   dev DB — that's expected; the dev DB is managed via `db push`. Fresh databases migrate cleanly.

## Testing

Two layers:

- **Unit/integration (Vitest)** — tests live in `__tests__/` dirs next to code. Shared mocks:
  `src/test/mock-db.ts` (smart-default Prisma proxy) and `src/test/mock-store.tsx` (zustand +
  localConfig). Coverage is ratcheted in `vitest.config.ts` (`thresholds`: 70% lines /
  68% statements / 60% functions / 53% branches) — `npm run test:coverage` fails below them.
  Do not commit test files without real assertions.
- **E2E (Playwright)** — specs in `e2e/` (`npm run e2e`), driven against the dev server
  (`webServer` in `playwright.config.ts` reuses a locally running one; CI would boot its own).
  Keep `workers: 1` while e2e runs against `next dev` — parallel workers churn webpack
  compilation and abort requests.
- **Local-config verification** — `scratch/verify-kpi-config.test.ts` validates the
  gitignored local `kpi-plugin-config.json` (formula plugins compiled through the sandbox,
  chart layout consistency) against real ticket data from a fixture generated by
  `scratch/export-fixture.cjs` (also gitignored). The suite skips cleanly when either file
  is absent, so fresh checkouts stay green. `scripts/merge-view-charts.mjs` rebuilds the
  config's `databaseViews` section from the live database.

Keep both suites green before committing; `npm run type-check` must stay at zero errors.

## Repository hygiene notes

- The repo contains committed AI-tooling scaffolding (`.claude/`, `.moai/`, `.kilo/`,
  `.antigravitycli/`) and working-note markdown files at the root (`TIME_SERIES_*.md`,
  `TREND_PLUGIN_FIX.md`, etc.). Don't rely on them as project documentation; `docs/` is the
  canonical documentation folder.
- `plan/`, `scratch/`, `_workspace/`, `docu/`, `enhancements/` are scratch areas.
- Screenshots referenced by the README live in `docs/screenshots/`.
