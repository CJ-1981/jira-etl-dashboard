# Jira ETL Dashboard — Development Guide

Guidance for AI coding agents and developers working in this repository.

## Project Overview

A single-page Next.js dashboard that extracts ticket data from Jira (Cloud or Server), calculates business-hour KPIs (German-holiday-aware), and exports results to CSV/JSON, PostgreSQL (Metabase/Supabase), or PowerPoint. Packaged as a portable standalone app (caxa) for Windows/macOS.

**Tech stack:** Next.js 16 (App Router, standalone output), React 19, TypeScript, Prisma 6 (dual SQLite/PostgreSQL clients), TanStack React Query, Zustand, shadcn/ui + Tailwind CSS 4, Recharts, Vitest.

## Commands

```bash
npm run dev            # Dev server on port 3000 (runs prisma-setup first via predev)
npm run build          # Production build → .next/standalone
npm start              # Run standalone production server
npm test               # Vitest (run mode: npx vitest run)
npm run test:coverage  # With v8 coverage
npm run lint           # ESLint (note: most rules are disabled in eslint.config.mjs)
npm run type-check     # tsc --noEmit — ALWAYS run this before committing
npm run db:push        # Push schema to SQLite (default DATABASE_URL)
npm run db:push:pg     # Push PostgreSQL schema (prisma/schema.postgresql.prisma)
npm run db:studio      # Prisma Studio
build-exe.bat          # Windows portable exe (caxa); build-exe.sh for macOS
```

CI runs `test:coverage`, `lint --max-warnings=10`, and `type-check` on push/PR to main/develop (Node 22).

## Architecture

### Single page + API routes
The UI is one page (`src/app/page.tsx`, tabbed panels under `src/components/dashboard/`). All data flows through ~20 API routes under `src/app/api/`:

- `jira/extract` — core ETL: JQL pull → `EtlRun` + `TicketSnapshot`/`TicketTransition` + `MasterTicket` upserts → KPI calculation → `KpiResult` storage
- `jira/poll` — server-side background polling scheduler (keeps credentials in `globalThis` state)
- `kpi/calculate` — KPI engine entry point; the UI calls this, there is no client-side calculation
- `kpi/plugins/custom` — CRUD for user plugins (writes `.ts` files, requires restart)
- `dashboard/views` — saved views persisted in the DB (`DashboardView` model)
- `pg/export`, `pg/test`, `webhooks/jira`, `holidays`, `export/file`, `debug/health`

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
- 29 plugins registered statically in `src/lib/kpi/plugin-loader.ts`:
  21 in `plugins/builtin/{processing-time,sla,turnaround,throughput,quality,assignee}`,
  8 in `plugins/time-series/...`. To add a built-in plugin: create the file, import and
  register it in `plugin-loader.ts`.
- Runtime-loaded custom plugins come from `data/custom-plugins/` (or `CUSTOM_PLUGIN_DIR` env).
  The loader, the file watcher, and the custom-plugin API all resolve this path through
  `getCustomPluginDir()` in `src/lib/kpi/plugin-paths.ts` — keep them aligned by always using
  that helper rather than hardcoding a directory. Plugins uploaded via the API are written to
  disk but only activate on server restart (the engine registers custom plugins at startup).
- All time-based KPIs use business-hour math from `src/lib/holidays/german-holidays.ts`
  (all 16 German states; configured per connection in `data/settings.json` defaults).

### Where configuration lives
- **Jira connections, Postgres connections, app settings, dashboard state: browser
  `localStorage`** via `src/lib/config/local-store.ts` — there is no `JiraConnection` table
  in the current schema (older code/comments may suggest otherwise).
- Runtime defaults: `data/settings.json` (tracked in git — work hours, SLA targets, retention).
- Server env: `.env` (`DATABASE_URL`, `JIRA_WEBHOOK_SECRET`, …) — untracked, never commit it.

### Code annotation convention (MX tags)
The codebase uses `@MX:` comment tags; follow the same style in significant changes:
- `@MX:NOTE` — intent/context explanation
- `@MX:WARN` + `@MX:REASON` — danger zone / invariant that must not be broken casually
- `@MX:ANCHOR` + `@MX:REASON` — high fan-in contract point
- `@MX:TODO` — known incomplete work

## Gotchas & Known Issues

1. **Build ignores type errors** — `next.config.ts` sets `typescript.ignoreBuildErrors: true`
   and ESLint disables most rules. `npm run type-check` is the only real static gate.
2. **`REACT_APP_*` env vars do nothing** — leftover CRA convention in
   `src/lib/jira/field-config.ts`; Next.js does not expose them.
3. **`src/lib/kpi/kpi-worker.ts` is dead code** — never instantiated; all KPI math runs
   server-side via `/api/kpi/calculate`. Don't build features assuming a Web Worker exists.
4. **Custom plugin upload = server-side file write** into the custom-plugin directory
   (`data/custom-plugins/`) with the plugin's `calculate` body interpolated, and `engine.ts`
   compiles request-body formulas with `new Function(...)`. Treat both as code-execution
   surfaces; never expose this app untrusted on a network.
5. **Electron path is abandoned/broken** — `electron/main.js` loads `../out/index.html`, but
   no `output: 'export'` build exists (production is `standalone`). The caxa pipeline
   (`build-exe.*` + `launcher.cjs`) is the real distribution path.
6. **Jira custom field IDs are hardcoded** in several places (`customfield_10002`,
   `customfield_10132`, `customfield_10020`, `customfield_10014/10016`) despite the
   field-config mapping — check both when changing field handling.
7. **Port handling** — dev is pinned to 3000. Production launchers scan for a free port:
   `launcher.cjs` (caxa exe) starts at 3200 and increments until one is free (set `PORT` env
   to force a specific port); the build-production launchers scan 3000–3100. A busy default
   port therefore never blocks startup.

## Testing

Vitest + Testing Library + jsdom (`vitest.config.ts`). Tests live in `__tests__/` dirs next to
code. Mock Prisma via the patterns in `src/lib/kpi/__tests__/mocks.ts` and
`src/hooks/__tests__/test-utils.ts`. As of the last review: 17 files / 253 tests, all passing.

## Repository hygiene notes

- The repo contains committed AI-tooling scaffolding (`.claude/`, `.moai/`, `.kilo/`,
  `.antigravitycli/`) and working-note markdown files at the root (`TIME_SERIES_*.md`,
  `TREND_PLUGIN_FIX.md`, etc.). Don't rely on them as project documentation; `docs/` is the
  canonical documentation folder.
- `plan/`, `scratch/`, `_workspace/`, `docu/`, `enhancements/` are scratch areas.
- Screenshots referenced by the README live in `docs/screenshots/`.
