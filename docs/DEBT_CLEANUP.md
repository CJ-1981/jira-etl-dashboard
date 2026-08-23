# Technical Debt Cleanup — Refactoring Log

Branch: `refactor/debt-cleanup` (based on `main` @ v0.9.0)

This document tracks the phased cleanup of technical debt identified in the
2026-08-23 codebase review. Each phase is executed TDD-style: tests are
written (or proven failing) first, then the change is made, then all gates
must pass.

**Quality gates (must stay green after every phase):**

| Gate | Command | Constraint |
|---|---|---|
| Type check | `npm run type-check` | 0 errors |
| Lint | `npm run lint` | warnings ratchet: must not increase (baseline 1087, threshold 2000) |
| Unit tests | `npx vitest run` | all pass |
| Coverage | `npm run test:coverage` | ≥ 70% lines / 68% stmts / 60% fn / 53% branch |

---

## Phase 1 — Security hardening, metric-consistency fix, dead-code removal

Three parallel workstreams with strictly disjoint file ownership:

### 1A. API route security guards + input validation
**Why:** the documented threat model is a malicious webpage POSTing to this
unauthenticated localhost app (`src/lib/security.ts`). Only 4 mutating routes
had the loopback guard; 10+ did not — including routes that delete all
connection data, ingest Jira credentials, and write to caller-supplied
Postgres. Additionally `src/lib/validation/schemas.ts` (zod) existed but was
completely unused, and the bulk view import had a random-ID upsert bug that
guaranteed duplicate views on re-import.

**Changes:**
- `isLoopbackOriginRequest` guard added to all mutating handlers in:
  `dashboard/views` (POST), `dashboard/views/bulk` (POST),
  `dashboard/views/[id]` (PATCH/DELETE), `dashboard/views/[id]/default`
  (POST/DELETE), `jira/extract/cleanup` (POST), `jira/master/[connectionId]`
  (POST/DELETE), `jira/poll` (POST), `kpi/plugins/custom` (PUT/DELETE),
  `pg/export` (POST).
- `webhooks/jira` private loopback check consolidated onto the shared guard.
- `StorageConfigSchema` added; caller-supplied `storageConfig` is now
  validated before reaching `getDb()`.
- Bulk import upsert bug fixed (stable IDs instead of `Math.random()`).
- Webhook route normalized from `NextRequest` to `Request` (matches all other
  routes; removes test casts).
- `src/test/mock-db.ts`: typed `createMockDb()` as `MockDb` so tests can
  access models without `as any`; `makeRequest` accepts optional headers.
- Tests: 401 on external origin / pass-through without headers / accept
  localhost, per guarded handler (43 new API tests + 10 schema tests).

### 1B. SLA trend copy-paste fix (metric consistency)
**Why:** `sla-by-status-excl-clone-weekly.ts` was a 175-line verbatim copy of
`sla-by-status-weekly.ts`, and the copy had silently dropped the comment-based
SLA clock reset that the builtin card plugin honors — card and trend reported
different SLA numbers for the same data.

**Changes:** excl-clone weekly plugin now delegates to the shared trend
calculation with an explicit excl-clone/comment-reset parameter, mirroring the
builtin delegation pattern. Duplicated code deleted. The comment-based clock
reset was additionally enabled for the PLAIN weekly trend: the builtin plain
card applies it unconditionally, so the plain card/trend pair had the same
divergence. Parity tests now lock in that both card/trend pairs agree when a
comment resets the SLA clock.

### 1C. Dead code removal
**Why:** ~1,500 lines of modules with zero production references (some still
carried maintained tests).

**Deleted:**
- `src/lib/postgres/client.ts`
- `src/lib/api-middleware.ts`
- `src/lib/cache/jql-cache.ts`
- `src/lib/utils/date-cache.ts`
- `src/lib/kpi/kpi-worker.ts`
- `src/lib/kpi/plugin-cache.ts` (+test)
- `src/lib/kpi/plugin-validator.ts` (+test)
- `src/lib/kpi/utils/dependency-resolver.ts` (+test)
- `src/app/api/route.ts` ("Hello, world!" stub + its test)
- dead `transformIssue`/`extractTransitions`/`calculateTimeInStatus` block in
  `src/lib/jira/client.ts` (superseded by `transformIssueForKpi`), including
  the module-private `JIRA_FIELD_MAP` whose only consumer was `transformIssue`

The plugin-cache/plugin-validator/dependency-resolver modules were exercised
only by `benchmark.test.ts` and `integration.test.ts`; those suites were
trimmed to the production `PluginRegistry` coverage, and the now-orphaned
mock fixtures were removed from `__tests__/mocks.ts`.

Each deletion verified reference-free across `src/`, `scripts/`, `e2e/`,
`electron/` before removal.

### Phase 1 results

| Gate | Baseline (v0.9.0) | After Phase 1 |
|---|---|---|
| Type check | 0 errors | 0 errors |
| Lint warnings | 1,087 | **1,076** (−11) |
| Tests | 918 passed | **904 passed** (+60 new, −74 dead-code tests removed) |
| Coverage (lines) | 70.98% | 70.4% (floor 70%) |

---

## Phase 2 — Dependency & UI component pruning

**Why:** 26 of 48 shadcn/ui components were never imported; several npm
dependencies had zero references.

**Changes:**
- Deleted 28 files, each verified zero-import before removal: the 26 unused
  shadcn components (accordion, aspect-ratio, avatar, breadcrumb, calendar,
  carousel, chart, collapsible, context-menu, drawer, dropdown-menu, form,
  hover-card, input-otp, menubar, navigation-menu, pagination, progress,
  resizable, sidebar, slider, sonner, textarea, toaster, toggle,
  toggle-group) plus the orphaned cascade `toast.tsx` and
  `src/hooks/use-toast.ts`. The remaining 21 components were verified used.
- Uninstalled 26 npm packages:
  - unused outright: `next-intl`, `react-markdown`,
    `react-syntax-highlighter`, `@reactuses/core`, `date-fns`
  - cascade from deleted components: `@radix-ui/react-{accordion,
    aspect-ratio, avatar, collapsible, context-menu, dropdown-menu,
    hover-card, menubar, navigation-menu, progress, slider, toggle,
    toggle-group, toast}`, `embla-carousel-react`, `input-otp`, `vaul`,
    `react-resizable-panels`, `react-day-picker`, `react-hook-form`,
    `@hookform/resolvers`
- Verified kept: `cmdk` (used by the kept command palette + JQL
  autocomplete), `zod` (validation schemas), `sonner` (app imports toast
  directly from the package).

---

## Phase 3 — Date/week handling unification

**Why:** `TimeSeriesDataPoint.date` was typed `Date` but arrives as a string
after the API JSON round-trip (root cause of the issue documented in
`BUGFIX_TIME_SERIES_DATE_PARSING.md`, patched in one consumer only), and the
local-time Monday week computation was copy-pasted three times (engine
`buildPreprocessed`, engine `calculate`, `weekly_ticket_list` plugin).

**Changes (TDD; no KPI numbers changed):**
- `TimeSeriesDataPoint.date` widened to `Date | string` with `@MX:WARN`
  documentation. The compiler surfaced exactly 6 unsafe `.getTime()` sort
  sites in the time-series plugins; all fixed via `new Date(...)`
  normalization (no `any`, no suppressions). `chart-data-utils.ts` chart
  point types widened to match; string-date sorting locked in by new
  regression tests.
- New `src/lib/utils/week-boundaries.ts` — `getLocalMondayWeekBounds()` with
  8 unit tests, including a behavior oracle comparing against a verbatim
  copy of the legacy engine algorithm. Replaces all three duplicated
  computations.
- `getPeriodKey` default case now zero-pads; the UTC-ISO-week (trend
  plugins) vs local-Monday-week (engine card buckets) split is documented
  with `@MX:WARN` at the top of `time-series-utils.ts`. Changing which
  definition wins is a product decision and was deliberately NOT made here.

---

## Final results

| Metric | v0.9.0 baseline | After cleanup | Delta |
|---|---|---|---|
| Lint warnings (ratchet) | 1,087 (threshold 2,000) | **1,068** (threshold tightened to 1,068) | −19 warnings, threshold −932 |
| Type errors | 0 | 0 | — |
| Tests | 918 | **917** (+73 new, −74 dead-code tests removed) | coverage preserved |
| Coverage (lines) | 70.98% | 70.3% (floor 70%) | dead code removed from both numerator and denominator |
| npm dependencies | 89 | 63 | −26 packages |
| shadcn components | 48 | 21 | −27 files (−7,100 lines) |
| Mutating API routes with loopback guard | 4 of ~15 | **all** | security gap closed |
| Card/trend SLA rule divergence | excl-clone AND plain pairs diverged | both consistent | metric bug fixed |

Commits on `refactor/debt-cleanup`:
1. `52d2350` — phase 1: security guards, SLA parity, dead code removal
2. `a954224` — phase 2: unused UI components + dependency pruning
3. `c713c0f` — phase 3: honest time-series date typing + shared week bounds
4. _(this commit)_ — ratchet tightening + docs

---

## Deferred backlog (not in this branch)

Items intentionally out of scope here — each touches architecture broadly and
needs its own branch/review:

- Decompose `KpiDashboard.tsx` (2.7k lines, 9 copy-paste widget cases),
  `ChartCard` (1.4k lines), `ExtractPanel.tsx` (26 `useState` calls).
- Consolidate the three widget-order/plugin-visibility sync mechanisms into a
  single zustand slice.
- Move ~36 raw `fetch` call sites onto the already-configured React Query.
- Type the dual Prisma client in `src/lib/db.ts` (retires ~150 `(db as any)`
  casts; the largest single `no-explicit-any` source — 703 warnings).
- Cascade-delete logic duplicated in 4 routes (only one transactional).
- Age-breakdown logic duplicated across 5 builtin plugins (~600 lines).
- Electron removal decision (`electron/` path is documented as broken; caxa
  is the real distribution path).
- Root-level working-note markdown files (`TIME_SERIES_*.md`, etc.) → move to
  `docs/` or delete.
- Orphaned dev-DB migration record `20260528000000_add_ticket_snapshot_rawdata_owner_team`.
- Wire E2E into CI.
