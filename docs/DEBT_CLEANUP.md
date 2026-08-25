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

## Phase 4 — Deduplication, typing, and CI hardening (branch `refactor/phase4-deduplication`)

### 4A. Cascade-delete deduplication
**Why:** the FK-safe deletion sequence was copy-pasted in 4 places with
inconsistent atomicity — only the connections route used a transaction; the
master route (twice, verbatim, in the same file) and the cleanup route could
leave partial deletes on failure.

**Changes:**
- New `src/lib/db-cascade.ts` (structural `DbLike`/`TxLike` types, zero
  `any`, no Prisma import): `deleteEtlRunsWithChildren(tx, runIds)` and
  `deleteConnectionData(db, connectionRef)` which runs the full cascade in
  one `$transaction`.
- connections DELETE, master POST-delete, and master DELETE all delegate to
  it; the master DELETE handler's duplicated block (~110 lines) is gone and
  its previously swallowed errors are now logged.
- `jira/extract/cleanup` is now transactional too and reuses the shared
  child-deletion helper.
- Behavior alignment (bug fixes): master-route deletes now also remove
  orphaned `kpiResult` rows (NULL `etlRunId`) and `dashboardView` rows,
  matching the connections route.
- 11 new unit tests (deletion order via `invocationCallOrder`, count
  aggregation, empty cases, transaction wiring, error propagation) + 7 new
  route tests.

### 4B. Age-breakdown plugin deduplication
**Why:** five builtin plugins each carried ~100 lines of the same
group-by-dimension × age-category × sort algorithm.

**Changes:**
- New `src/lib/kpi/utils/age-breakdown.ts` (`calculateAgeBreakdown` +
  exported age-label constants), 12 unit tests including a parity fixture
  against the pre-refactor plugin output.
- The five plugins shrank to metadata + filter + delegation (516 → 211
  lines; −468/+80 in the plugins). Existing plugin tests pass unchanged,
  proving byte-equivalent results.
- `open-tickets-kanban` intentionally kept separate: its 3-level grouping
  diverges on too many axes (fallback labels, age labels, name format,
  display dimension) for the shared helper to absorb cleanly.

### 4C. Typed dual Prisma client
**Why:** `src/lib/db.ts` imported the generated clients under `@ts-ignore`,
making `getDb()` return `any` and forcing ~150 `(db as any).model` casts
across the API layer.

**Changes:**
- Exported structural `PrismaModelDelegate` / `DbClient` types covering the
  six schema models plus `$transaction`/`$queryRaw`/`$executeRaw`/
  `$disconnect`; `getDb()`, `getDefaultDb()`, and `db.client` are now typed.
- Both `@ts-ignore` directives removed entirely — the dual-client imports
  proved error-free at the type level.
- Routes were intentionally NOT refactored in this pass; their casts still
  compile and can now be retired incrementally. This change already removed
  lint warnings and is the foundation for eliminating the rest.
- 6 new tests (`buildPgUrl` edge cases + structural-type wiring).

### 4D. E2E wired into CI
**Why:** the Playwright suite existed but never ran in CI.

**Changes:** new `e2e` job in `.github/workflows/ci.yml` — installs Chromium
with system deps, lets the Playwright config boot the dev server (strict
CI-mode config: `forbidOnly`, retries), uploads the HTML report as an
artifact. Validated locally in CI-simulation mode: 22/22 passed. The first
real CI run exposed a genuine gap: `scripts/prisma-setup.mjs` skips
`prisma db push` when `CI=true`, so the app's fallback SQLite file never
existed on the runner and the connection-delete E2E failed with
SQLITE_CANTOPEN. The e2e job now initializes the SQLite database explicitly
before running the suite.

### 4E. Coverage configuration fix
The phase-4C test legitimately imports `src/lib/db.ts` unmocked (to test the
real `buildPgUrl`), which loads the generated Prisma runtimes into the
instrumented set and collapsed global coverage. Generated code is not
meaningfully measurable — `prisma/generated/` added to the coverage
`exclude` list in `vitest.config.ts`.

---

## Phase 5 — Cast retirement, typing, consolidation, Electron removal (branch `refactor/phase5-cleanup`)

Four parallel workstreams with disjoint file ownership, executed TDD-style.
Documentation is part of the deliverable: this section tracks each
workstream, `docs/REFACTORING_SUMMARY.md` carries the full work log with
commit IDs, and `CLAUDE.md` is updated wherever behavior facts change.

### 5A. Retire `(db as any)` casts across the API routes
**Why:** the phase-4C structural `DbClient` type made ~48 route-level casts
removable; they were still the largest single `no-explicit-any` source.

**Changes:**
- Added the batch `$transaction` overload to `DbClient` (the extract route's
  three `PrismaPromise[]` transactions were the only sites not covered).
- **45 casts removed**: 36× `(db/prisma/getDefaultDb() as any)` across 12
  route files, 4× `(tx: any)` param annotations, `let db: any`/
  `let etlRun: any` in the extract route, and all 5
  `db as unknown as DbLike` bridges.
- Results read from `Promise<unknown>` got narrow local types instead of
  casts (`EtlRunRow`, `TicketSnapshotRow`, `DashboardViewRow`,
  `EtlRunSizeAggregate`, `LatestRunRow`, `MasterTicketMeta`).
- `db-cascade.ts`: `CascadeModelDelegate` returns widened to
  `Promise<unknown>` so `DbClient` is directly assignable to `TxLike` and
  `DbLike` — routes pass `db` with zero bridging casts.
- Gates: type-check clean; API suites 149/149; zero new lint warnings.
  Pre-existing element-level `(t: any)` lambdas and Jira-field casts
  intentionally left (they model external API shapes).

### 5B. Typed issue shape + chart-data-utils wins
**Why:** `transformIssueForKpi` carried 18 `as any` casts to model an
implicit two-shape issue union; `chart-data-utils.ts` had leftover casts,
a fully dead `_trend` ID list, and triplicated weekly-detail parsing.

**Changes:**
- Explicit `KpiIssueInput` union (`KpiJiraIssue | FlatIssue`) +
  `'fields' in issue` discriminator in `types.ts`; `transformIssueForKpi`
  refactored to a single typed narrowing — **25 `as any` casts eliminated**,
  covered by 5 new tests (both shapes + equivalence). Writing the tests
  first exposed a latent crash: the old code threw on truly flat issues
  (`reading 'updated'` of undefined); the refactor fixes it. Two dead
  imports removed as well.
- chart-data-utils: 11 leftover casts removed (local result/point types now
  carry `ticketKeys`/`isComplete`), 4 `(d: any)` detail callbacks typed,
  dead `_trend` ID list deleted (real trend IDs all match the
  `includes('trend')` check — proven by new tests), and the dual-format
  weekly-detail parsing consolidated into one `extractWeeklyBreakdown`
  helper used by both chart paths and `hasAgeBreakdown`.
- Gates: type-check clean; KPI + chart suites 403/403; lint 1,032 → **931**
  (engine-utils 27→0 warnings, chart-data-utils 20→7).

### 5C. Frontend hook and storage consolidation
**Why:** `useWidgetOrder` and `usePluginVisibility` were structural clones;
localStorage keys were hardcoded in ~13 places bypassing `localConfig`; the
keyboard-shortcut guard was duplicated; several hook APIs were dead.

**Changes:**
- New generic `usePersistedList` hook; both list hooks rewritten as thin
  wrappers with unchanged public APIs.
- Dead APIs removed (`getWidgetDefinitions`, `isWidgetVisible`,
  `applyStagingFilters`), dead `useQuery` import removed.
- Keyboard guard extracted to a shared hook used by `page.tsx` and
  `KpiDashboard.tsx`.
- localStorage literals consolidated into `KEYS`/helpers in `local-store.ts`
  (theme, `activeView_${id}` via new `activeViewKey()`). The
  `cfg_active_plugins` and widget-order literals stay as single documented
  module constants mirroring `KEYS.*`: three KpiDashboard test files mock
  `local-store` without a `KEYS` export, so importing `KEYS` into that
  module graph would break them — consolidating the mock is a follow-up.
- New tests: `usePersistedList` (18), `useGlobalShortcuts` incl. the guard
  predicate (17), `KEYS.activeView`/`activeViewKey` cases; the dead-API
  assertions were dropped from the existing hook tests.
- Gates: type-check clean; full suite **1,003 tests passing**; hook/config/
  dashboard suites 323/323.

### 5D. Electron removal
**Why:** the Electron path was documented as abandoned/broken
(`electron/main.js` loads a build output that no build produces); caxa is
the real distribution path.

**Changes:**
- Deleted `electron/`, the four Electron docs, the `main` field, the
  electron scripts, the electron-builder `build` config, and the three
  electron devDependencies; stale references fixed (`next.config.ts` comment,
  CLAUDE.md gotcha).
- Follow-up in the same pass: `concurrently` and `wait-on` became orphaned
  (only `electron:dev` used them) and were uninstalled too — 5 devDeps and
  218 lock-file packages removed in total.
- Remaining intentional mentions: the CLAUDE.md removal note, a comment in
  `eslint.config.mjs` (still valid for `launcher.cjs`), and the archived
  `docs/user-manual.html`.

---

## Phase 6 — Error handling, trend scaffold, state fix, doc hygiene (branch `refactor/phase6-consolidation`)

Four parallel workstreams with disjoint file ownership.

### 6A. API error-handling unification
**Why:** `src/lib/api-error.ts` existed but only 1 of 25 routes used it;
~19 routes hand-rolled try/catch with inconsistent shapes and status codes.

**Changes:**
- Helper hardened: the fragile `"not found" → 404` substring heuristic
  removed (routes throw `NotFoundError` explicitly instead); new
  `getApiErrorStatus()` forwards typed `ApiError` statuses and valid numeric
  `.status`/`.statusCode` from upstream errors; zod detection typed (no
  `any`).
- **21 route files converted** to `handleApiError`; loopback guards,
  validation responses, and success responses preserved exactly.
- Consumer-safety decisions: `extract/latest` "no extractions" now a proper
  404 (verified no runtime consumer); bare-`{error}` shapes in
  `webhooks/jira` + `export/file` normalized to `{success:false,error}`
  (consumers checked first); the webhook keeps a generic 500 message so
  internal error text cannot leak to external Jira servers; upstream Jira
  statuses (401/429/5xx) still forwarded by `jira/extract`.
- Not converted (bespoke contracts): `debug/health`, `pg/test`, `jira/test`.
- 31 new tests: helper contract suite (14) + error-path coverage across all
  converted routes. Gates: API suites 180 passing; lint scope 104 → 94.

### 6B. Time-series scaffold deduplication
**Why:** ~8 of 9 trend plugins hand-rolled the same zero-fill →
complete-period aggregation → incomplete-marker pipeline (~1,280 lines).

**Changes:**
- New `src/lib/kpi/utils/trend-scaffold.ts` (195 lines): period
  preparation/enumeration, flow vs snapshot point builders, plain and
  count-weighted means over complete periods, the shared incomplete-period
  detail marker — 12 unit tests (RED confirmed first).
- **8 plugins migrated** (throughput, avg-processing-hours, sla-compliance,
  priority-inflow, time-in-status, open-tickets-by-assignee,
  cumulative-flow, sla-by-status); each keeps its bespoke metric
  extraction/details/naming. `sla-by-status-excl-clone-weekly` already just
  delegates, so nothing to extract there.
- Existing plugin tests pass **unchanged** after each migration —
  byte-equivalent output (names, values, units, dimensions, details,
  ticketKeys, point order).
- Delta: 376 lines of hand-rolled boilerplate replaced by one tested
  implementation; lint 933 → 916.

### 6C. kpiResults dual-write fix
**Why:** the store's `kpiResults` slice was synced by React Query in
`useKpiCalculations` while a plugin-filter effect in `KpiDashboard` mutated
the same slice (with the slice in its own deps, guarded only by a ref) — a
feedback loop and likely bug source.

**Changes:**
- The store slice is now documented and enforced as the RAW calculation
  payload, owned solely by the React Query sync. Plugin-visibility
  filtering moved to render-time derived memos in `KpiDashboard.tsx`
  (`filteredKpiResults`, `visibleCharts`); consumers (section gates,
  `KpiDataTable`, both `ChartCard` props, CSV export) rewired to the derived
  list.
- The self-referencing filter effect and its `lastFilteredPlugins` guard ref
  were deleted entirely; cross-tab reactivity is preserved via the existing
  storage-event listener in `usePersistedList`.
- TDD: 6 new component tests (5 confirmed RED against the old code) assert
  filtering never writes to the store; +2 characterization tests lock the
  hook side of the contract. Deliberately preserved: chart configs of
  deactivated plugins stay stored but hidden; never-configured state shows
  all; recalculation triggers unchanged.
- Gates: type-check clean; full suite **1,023 tests passing**; lint 933 →
  **924** (net-zero from this workstream).

### 6D. Root markdown hygiene
**Why:** six AI-session working notes at the repo root were not project
documentation and contained stale content.

**Changes:**
- Deleted `TIME_SERIES_ENHANCEMENTS.md`, `TIME_SERIES_FIXES.md`,
  `TIME_SERIES_PLUGIN.md`, `TREND_PLUGIN_FIX.md`,
  `BUGFIX_TIME_SERIES_DATE_PARSING.md`,
  `SLA_STATUS_TREND_IMPLEMENTATION.md` — each verified reference-free
  before removal.
- Durable facts extracted into the appendix below (date-parsing bug
  symptom + original patch location; SLA semantics pointers).
- `custom_plugin_guide.md` kept (referenced by README/CLAUDE.md);
  CLAUDE.md hygiene note updated accordingly.

---

## Phase 7 — Component decomposition & consolidation (branch `refactor/phase7-components`)

Five parallel workstreams with disjoint file ownership.

### 7A. ExtractPanel decomposition
**Why:** 1,434 lines with 25 `useState` calls mixing five concerns; 12
untyped `(i: any)` lambdas in the preview table.

**Changes:**
- `ExtractPanel.tsx` is now a 274-line orchestrator; 12 new modules under
  `src/components/dashboard/extract/`: typed `PreviewIssue`/
  `DiscoveredField` types, typed issue accessors (all 12 `any` lambdas
  gone), `useExtraction` + `usePolling` hooks, and presentational
  `JqlEditor`, `CustomFieldDiscovery`, `PollingSettings`,
  `QuickDateSelector`, `MasterDatasetCard`, `EmptyExtractionCard`,
  `ExtractionPreviewTable` components.
- Contract preserved exactly: same export/props, localStorage keys,
  endpoints, toasts, 5s polling semantics with the deep-equality guard;
  DOM structure unchanged.
- 32 new tests (subcomponents + hooks); the original `ExtractPanel.test.tsx`
  passes unchanged. Panel's production files went from 31 lint warnings to 0.

### 7B. KpiDashboard widget-switch decomposition
**Why:** ~1,096 lines of near-identical inline widget JSX across 9 switch
cases; the last storage-key constants blocked from `KEYS` by test mocks.

**Changes:**
- New `src/components/dashboard/widgets/` directory: 8 widget components
  (`StatusTimeWidget`, `StatusOpenWidget`, `SlaPriorityWidget`,
  `OtherPriorityWidget`, `SlaStatusWidget`, `AssigneeWidget`,
  `KanbanWidget`, `CycleTimeHistogramWidget`) plus shared `WidgetCard`
  chrome and four larger sections (`DashboardHeader`,
  `DashboardFloatingBar`, `MetricsOverview`, `VisualizationsSection`).
- **KpiDashboard.tsx: 2,614 → 1,265 lines (−52%)**; the switch is now pure
  component lookup. All behavior quirks preserved verbatim (hidden-prefix
  matching, per-widget button colors, kanban's bespoke collapse button).
  Off-limits by design: `calculateWidgetJql`, the phase-6C derived memos,
  shortcuts.
- KEYS consolidation: all four KpiDashboard test mocks now spread the real
  `local-store` module via `importOriginal`; KpiDashboard and
  `useWidgetOrder` use `KEYS.activePlugins` / `KEYS.widgetOrder` directly —
  the last hardcoded storage-key literals are gone. Cross-tab behavior
  verified (51 hook tests).
- Zero assertion changes: only the mock factories were adapted; all 41
  KpiDashboard tests pass unchanged. Lint 917 → 846 (imports cleaned).

### 7C. React Query migration (small panels)
**Why:** seven panels made ~21 raw `fetch` calls with hand-rolled
loading/error state while a QueryClient was already configured.

**Changes:**
- All 21 fetch sites migrated: `ViewManager` (7 — query replaces the manual
  AbortController/stale-response logic; one-time auto-restore preserved via
  a guarded effect; six mutations invalidate `['dashboard-views']`),
  `StoragePanel` (6 — storage-info + db-location queries, shared cleanup
  mutation with invalidation, PG test mutation; provider-switch cards stayed
  imperative as they're entangled with zustand/localConfig),
  `ExportPanel`/`SettingsPanel`/`ConnectionsPanel` mutations via
  `useMutation`/`mutateAsync` keeping orchestration and toast semantics
  identical, `HolidaysPanel` + `PluginInfoIcon` on `useQuery` with the same
  enabled/retry/skeleton behavior.
- Only ONE existing test needed adaptation (StoragePanel rerender inside the
  QueryClientProvider); every other test passes unchanged because mutations
  still call `fetch` internally.
- Lint 889 → 885. The pollers and big panels (ExtractPanel/PluginsPanel/
  KpiDashboard) are a later pass by design.

### 7D. Quote-aware splitter consolidation
**Why:** three near-identical inQuotes/quoteChar char-loops in
`engine-utils.ts` (×2) and `custom-formula.ts`.

**Changes:**
- New `src/lib/kpi/utils/split-top-level.ts`: pure `splitTopLevel(input,
  delimiter, options)` with parameterized differences (`caseInsensitive`,
  `keepQuotes`, `transform`, `keepEmptyTrailing`) — behaviors were
  parameterized, NOT unified (the variants differ deliberately, e.g. the
  keyword splitter's unconditional trailing segment that callers rely on).
- Verified zero drift: a 105-case adversarial characterization harness
  compared verbatim copies of all three original loops against the helper
  before refactoring (all matched; harness deleted afterwards), plus 48 new
  unit tests for the helper.
- All three call sites migrated; filter DSL and formula sandbox semantics
  unchanged (existing suites pass untouched). Lint 916 → 889.

### 7E. Dead `REACT_APP_*` env mechanism removed
**Why:** `REACT_APP_*` is a Create React App convention that Next.js never
exposes, so the field-ID overrides in `field-config.ts` were dead weight
(CLAUDE.md gotcha #2).

**Changes:**
- Replaced with server-side env vars that actually work:
  `JIRA_ISSUE_OWNER_TEAM_FIELD` / `JIRA_STORY_POINTS_FIELD` (defaults
  unchanged: `customfield_10132` / `customfield_10002`); function
  signatures and callers untouched.
- `.env.example` override block renamed (and the misleading
  `customfield_10000` example fixed), `docs/JIRA_FIELD_CONFIGURATION.md`
  updated, CLAUDE.md gotcha #2 rewritten.
- 6 new tests in `src/lib/jira/__tests__/field-config.test.ts` (defaults,
  each override, both together, empty-string fallback).
- Note: `scripts/backfill-issue-owner-team.js` still reads `REACT_APP_*` —
  it runs under plain Node where that works, but the naming now diverges;
  aligned in the one-off-script cleanup follow-up.

---

## Phase 8 — Final pass (branch `refactor/phase8-final-pass`)

Four parallel workstreams with disjoint file ownership.

### 8A. ChartCard decomposition
**Why:** `KpiCard.tsx` (~1,735 lines) holds `KpiCard` + `ChartCard`
(~1,365 lines); `renderChart()` ~780 lines across 5 chart branches; the
time-series merge block triplicated; zoom slicing + ReferenceArea overlay
repeated 4× each; three near-identical tooltips; 11-prop ChartCard.

**Changes:**
- New `src/components/dashboard/chart/` (9 files, ~1,340 lines): per-type
  `Bar/Line/Area/PieChartRenderer`s (each owns its `ResponsiveContainer`
  directly — required for recharts sizing), one variant-based
  `ChartTooltip` replacing three inline tooltips, `chart-zoom` module
  (`useChartZoom`, `sliceForZoom`, `ZoomSelectionArea` — the 4×
  repetitions), `chart-shared` (legend, SLA target lines, tooltip styles,
  active-dot drill-down), `ChartConfigControls`.
- `chart-data-utils.ts`: tested `mergeTimeSeries` (the triplicated merge) +
  `hasMultipleTimeSeries` with structural types (10 new tests).
- **KpiCard.tsx 1,735 → 803 lines; ChartCard ~1,365 → ~467** (renderChart
  ~780 → ~55-line dispatch). `any` count 51 → 0 (recharts handler typings
  via a guarded helper). Public exports and rendered element trees
  preserved exactly (tooltip ordering nuance included); 20 new renderer
  tests.

### 8B. Poller dedup + React Query completion
**Why:** three independent 5-second pollers (two hitting the same
`/api/jira/poll`), plus raw-fetch master-dataset loads in page.tsx.

**Changes:**
- Three shared query hooks: `useJiraPollQuery`, `usePluginEventsQuery`,
  `useMasterDatasetQuery` (exported query keys; transient failures resolve
  to `null` like the old silent catches).
- Consumers rewired with public APIs unchanged: `usePollingNotifications`
  (toasts once per new run id), `extract/usePolling` (pause via `enabled`,
  toggle/sync writes via `setQueryData`), `PluginsPanel` (reload once per
  new event counter), `page.tsx` (both master-load sites → one query, store
  synced in a single effect; ticket-list auto-populate only on restore /
  connection switch, never clobbering a fresh extraction preview),
  `extract/useExtraction` (invalidation + `fetchQuery` dedup).
- Dedup proven by `useSharedPollingQueries.test.tsx` (10 tests): two
  simultaneously mounted `/api/jira/poll` consumers issue exactly one fetch
  and hold one cache entry; same for plugin events.
- Raw `fetch` call sites are now fully migrated except the bespoke
  diagnostic endpoints; lint 845 → 784.

### 8C. Client JQL engine extraction
**Why:** `calculateWidgetJql` + `JQL_PATTERNS` (~150 lines) sat untested
inside KpiDashboard.tsx.

**Changes:**
- New pure module `src/lib/jql-widget-eval.ts` (218 lines, no React/IO, no
  `any` in the public API): `filterIssuesForWidget` pipeline +
  `applyGlobalFilters` / `applyWidgetJqlQuery` stages, typed
  `WidgetEvalIssue`/`WidgetJqlFilter`/`GlobalFilters`. KpiDashboard lost 98
  lines (one import + one call). `src/lib/jql-parser.ts` deliberately NOT
  merged — it's an autocomplete cursor parser with different semantics.
- **56 tests** (12 describe blocks) characterize the real behavior, written
  RED-first. The process surfaced five latent bugs, PINNED BY TESTS and
  intentionally left for a product decision (they change matching
  semantics): untrimmed global filter values, unsupported `~` operator
  degrading to full-text, case-sensitive field names, unparsed unquoted /
  compound `AND`/`OR` queries, and `[object Object]` normalization
  fallback.

### 8D. One-off script cleanup
**Why:** orphaned debug/backfill/test scripts, some referencing the removed
Electron flow or divergent env-var naming.

**Changes:**
- Deleted 7 orphaned files (each verified reference-free first):
  `reproduce-issue.mjs`, `backfill-issue-owner-team.js` (divergent
  `REACT_APP_*` naming), `test-api.bat`, `test-url-fix.bat`,
  `test-validation.bat`, `test-connection-feedback.bat`, root `test.bat`
  (stale `dist\Start Jira Dashboard.bat` electron path).
- Removed the `test-api.bat` echo line from `scripts/windows-setup.bat`.
- Kept `find-team-field.js` (referenced by field-config docs as the
  automated field-finder) and `memory-health.*` (documented in
  scripts/README.md). Known staleness noted: find-team-field's console
  advice cites field IDs now centralized in `field-config.ts`.

### 8-hotfix. "No QueryClient set" startup crash (post-merge regression)
**Symptom:** after the phase-8 merge, `npm run dev` → `GET /` returned 500
with `No QueryClient set, use QueryClientProvider to set one` from
`useJiraPollQuery` → `usePollingNotifications` → `Home`.

**Root cause:** the `QueryClientProvider` was rendered *inside* `Home`'s own
JSX in `page.tsx`, but phase 8B made `usePollingNotifications()` (called at
the top of `Home`) depend on `useQuery`. React context only flows to
*descendants*, so a hook in the same component that renders the provider
never sees it. Before 8B the hook used raw `fetch`/`useEffect` (no context
needed), which is why it worked until the migration.

**Fix:**
- New `src/app/providers.tsx` (`Providers`) creates the `QueryClient` per
  instance via `useState` (no module-scope client, which would leak across
  SSR requests/mounts) and is mounted in `src/app/layout.tsx` wrapping
  `{children}` — so every page/component hook sits below it.
- Removed the module-scope client + inner provider from `page.tsx`; the
  return now uses a fragment (`<>…</>`) since the provider no longer wraps
  it.
- Added `typeof window !== 'undefined'` guards to the three shared query
  hooks (`useJiraPollQuery`, `usePluginEventsQuery`, `useMasterDatasetQuery`)
  so SSR never attempts these client-only endpoints.
- Regression test: `src/app/__tests__/providers.test.tsx` (3 tests) pins the
  provider contract.

**Why TDD didn't catch it (process lesson):** every unit/hook test wraps its
render in a `QueryClientProvider` (correct harness practice), so the
"no provider above the page" path was never exercised. The Playwright E2E
suite *would* have caught it (page load → 500), but only unit gates
(type-check / lint / vitest / coverage) were run after phases 7–8. **Rule
added to CLAUDE.md: E2E is a required gate after any change to the frontend
data layer (providers, hooks, React Query wiring) or `src/app/`.**

### 8-hotfix-2. Duplicate chart-key console errors (`chart-resolution-by-priority`)
**Symptom:** `npm run dev` console: "Encountered two children with the same
key, `chart-resolution-by-priority`" from the KPI dashboard chart grid.

**Root cause:** persisted dashboard state (localStorage restore, saved views,
imported configs built by different script generations) can legitimately
contain two chart configs with the SAME `id`. `VisualizationsSection` maps
charts with `key={chartConfig.id}`, so duplicate ids violate React's
unique-key requirement (children can be duplicated/dropped). App logic never
creates duplicates itself (new charts get `chart-${Date.now()}`); they enter
only via persisted data.

**Fix (TDD, RED confirmed for the right reason):**
- New tested helper `dedupeChartsById()` in `src/lib/chart-data-utils.ts`
  (keeps the first occurrence, preserves order, keeps id-less entries).
- Applied at the render boundary (`KpiDashboard.visibleCharts` memo) so no
  duplicate key can ever reach React regardless of data, and at both
  persistence entry points (`page.tsx` state restore, `ViewManager` view
  apply) so stored state self-heals on the next auto-save.
- Tests: 5 helper unit tests + a component regression test asserting one
  card per unique id and zero duplicate-key console warnings (verified RED
  without the fix: two cards rendered for the same id).
- The four existing KpiDashboard test suites' `chart-data-utils` mocks were
  extended with a typed `dedupeChartsById` (component contract change).

**Gates:** type-check clean; 1,248 tests passing; lint 785 (ratchet held).

---

## Phase 9 — Final cleanup (branch `refactor/phase9-final-cleanup`)

Three parallel workstreams with disjoint file ownership.

### 9A. Zustand Set/Map slices → arrays/records
**Why:** five store slices used `Set`/`Map`, forcing manual clone
boilerplate ("must create a new Set instance"), `instanceof Map`
test-compat branches in `useKpiCalculations`, and Set/Map props threaded
through ~20 components — while persistence already uses plain arrays.

**Changes:**
- All five slices converted: `hiddenDimensions`, `collapsedWidgets`,
  `calculatingWidgets` → `string[]`; `customWidgetResults`, `jqlResultCache`
  → `Record<...>`; setters accept the new shape or a functional updater; the
  clone boilerplate is gone.
- Consumers updated across page.tsx (restore/save), ViewManager (view state
  save/restore with defensive `Array.isArray` guards), useKpiCalculations
  (both `instanceof Map` branches removed; functional record updates
  replaced a `getState()` stale-closure workaround in
  `calculateWidgetJql`), KpiDashboard, KpiCard, the chart renderers +
  chart-shared, and all widgets.
- Persistence compatibility: saved payloads were already arrays
  (`Array.from` at serialization time), so existing saved views and
  localStorage state remain byte-compatible; restore paths tolerate
  malformed payloads defensively.
- 18 new store tests (TDD): plain-data defaults, functional-updater
  semantics, insertion order, new-reference-per-update immutability.
- Gates: type-check clean; 1,266 tests passing; lint 785 → **782** (the
  removed `instanceof Map` branches carried `any` casts).

### 9B. KPI dashboard E2E coverage
**Why:** the two phase-8 hotfixes were page-load-level regressions only E2E
can catch, and the KPI Analytics tab had no e2e coverage.

**Changes:**
- New `e2e/kpi-dashboard.spec.ts` (5 tests): empty-state shell, console-error
  guard (hard-asserts zero pageerrors and no `same key` / `No QueryClient
  set` / React-error-boundary messages across load + tab switches), plugins
  sub-tab navigation, add/remove visualization flow with canned API
  intercepts (no real Jira/DB), and a seeded-results console guard driving an
  add/remove cycle where duplicate-key regressions surface.
- `e2e/helpers.ts` hardened: fixed `seedConnection` (the active-connection id
  was written as a raw string but read with `JSON.parse`, so it never took
  effect); `gotoHome`/`clickTab` now gate on React hydration before clicking
  Radix tab triggers (root cause of recurring flakes), with reload fallback.
- Suite now 27/27, verified across repeated back-to-back runs.

**The new coverage immediately surfaced two latent defects, both fixed TDD-style:**

1. **`cfg_active_plugins` self-poisoning** — mounting the dashboard before
   the first calculation persisted `cfg_active_plugins = []` (the empty
   plugin-id fallback); from then on the dashboard treated the user as having
   configured an EMPTY selection and filtered out every result permanently.
   Fix: `usePersistedList` no longer persists on mount — the fallback is
   written only after a user-initiated mutation (`toggle`/`reorder`/`setList`);
   syncs from storage use the raw setter and never mark a mutation. Existing
   tests pinning the old mount-persist behavior were updated deliberately.
   8 new hook tests + 1 scenario test pin the contract.
2. **"Updated Invalid Date" in DashboardHeader** — empty master-dataset
   responses omit `lastUpdated`; the badge now omits the timestamp when it is
   missing/unparseable. 3 new render tests.

### 9C. Stale find-team-field advice
**Why:** the kept `scripts/find-team-field.js` advised editing files that no
longer hold field IDs (centralized in `field-config.ts` + env override since
phase 7).

**Changes:**
- Script console advice now points to `JIRA_ISSUE_OWNER_TEAM_FIELD` in `.env`
  (with `.env.example` + `docs/JIRA_FIELD_CONFIGURATION.md` references);
  discovery logic untouched.
- `docs/JIRA_FIELD_CONFIGURATION.md`: `customfield_10100` references
  corrected to the real default `customfield_10132`.
- `docs/ISSUE_OWNER_TEAM_FIX_SUMMARY.md`: active advice fixed
  (`REACT_APP_…` in `.env.local` → `JIRA_ISSUE_OWNER_TEAM_FIELD` in `.env`);
  past-tense history left intact.
- Verified: `node --check` passes; zero `customfield_10100` references left
  in scripts/ and docs/.
- Caveat noted (backlog): the script bootstraps from
  `data/jira-extract-*.json` files that nothing in the current codebase
  writes anymore — it needs rewiring or retiring.

---

## Final results

| Metric | v0.9.0 baseline | After phases 1–9 | Delta |
|---|---|---|---|
| Lint warnings (ratchet) | 1,087 (threshold 2,000) | **780** (threshold tightened to 780) | −307 warnings, threshold −1,220 |
| Type errors | 0 | 0 | — |
| Tests | 918 | **1,278** | +360 net |
| Coverage floors (ratchet) | 70/68/60/53 | **75/73/66/61** (actuals 75.1/73.3/66.3/61.5) | floors raised ~5 points |
| E2E tests | 22 (local only) | **27, in CI** | KPI dashboard tab covered |
| npm dependencies | 89 | 58 | −31 packages |
| shadcn components | 48 | 21 | −27 files (−7,100 lines) |
| Mutating API routes with loopback guard | 4 of ~15 | **all** | security gap closed |
| Card/trend SLA rule divergence | excl-clone AND plain pairs diverged | both consistent | metric bug fixed |
| Cascade deletes transactional | 1 of 4 sites | **all 4** | partial-delete risk removed |
| E2E in CI | not wired | **wired + validated** | regression net on every push |
| `(db as any)` route casts | ~150 | **0** | routes typed against `DbClient` |
| `transformIssueForKpi` casts | 19 | **0** | typed `KpiIssueInput` union |
| Electron path | broken/abandoned | **removed** | caxa is the only distribution path |
| Routes using shared error handler | 1 of 25 | **22 of 25** (3 bespoke by design) | shapes + status codes normalized |
| Trend plugins hand-rolling the scaffold | 8 | **0** | one tested implementation |
| kpiResults store dual-write | yes | **no** (derived filtering) | feedback loop removed |
| KpiDashboard.tsx size | 2,691 lines | **~1,170** | widgets + sections + JQL engine extracted |
| ExtractPanel.tsx size | 1,434 lines / 25 useState | **274-line orchestrator** | 12 focused modules |
| KpiCard.tsx / ChartCard size | 1,735 / ~1,365 lines | **803 / ~467** | chart renderers extracted |
| Panels on React Query | 0 | **all incl. shared pollers** | caching + dedup + invalidation |
| Duplicate 5s pollers | 3 (2 same endpoint) | **0** (shared query sources) | one fetch per interval |
| zustand Set/Map slices | 5 | **0** (arrays/records) | clone boilerplate removed |
| Storage-key literals outside `KEYS` | ~13 | **0** | test mocks fixed to allow it |
| Quote-aware splitter copies | 3 | **1** (zero-drift verified) | 48 helper tests |
| Client JQL engine | untested, inline | **tested lib module (56 tests)** | 5 latent bugs pinned |
| One-off scripts | 7 orphaned | **removed** | references cleaned |

Commits: phases 1–3 on `refactor/debt-cleanup` (merged to main at `bf1d343`,
released as v0.10.0 including phase 4), phase 5 merged at `c54a3de`, phase 6
merged at `bab3508`, phase 7 merged at `0b91155`, phase 8 merged at
`7cf3f8c`, phase 9 on `refactor/phase9-final-cleanup`.

---

## Deferred backlog (remaining work)

Items still open after phase 8:

- Replace the `Set`/`Map` values in zustand with plain arrays/records to
  remove clone boilerplate and `instanceof Map` test-compat branches.
- Client-side widget JQL filter semantics — five latent bugs pinned by the
  phase-8C tests (untrimmed global filter values, unsupported `~` operator,
  case-sensitive field names, unparsed unquoted/compound `AND`/`OR` queries,
  `[object Object]` normalization fallback). Fixing them changes matching
  behavior users may rely on — needs a product decision + migration note.
- UTC-ISO-week vs local-Monday-week divergence (documented with `@MX:WARN`
  in `time-series-utils.ts` / `week-boundaries.ts`) — needs a product
  decision before unifying.
- `find-team-field.js` bootstraps from `data/jira-extract-*.json` files that
  nothing in the current codebase writes anymore (credentials live in
  browser localStorage now) — rewire it to accept connection params or
  retire it with its docs (phase 9C fixed its stale advice only).

Done in phase 8 (previously listed here): ChartCard decomposition
(1,735→803, renderers + tested mergeTimeSeries helper), poller dedup +
React Query completion (shared query sources, dedup proven), client JQL
engine extraction (56 characterization tests), one-off script cleanup
(7 orphaned files removed).

Done in phase 7 (previously listed here): KpiDashboard decomposition
(2,614→1,265, 8 widgets + 4 sections extracted), ExtractPanel decomposition
(1,434→274 orchestrator + 12 modules), React Query migration of the seven
small panels (21 fetch sites), quote-aware splitter consolidation
(zero-drift verified), KEYS test-mock fix + final storage-key consolidation,
dead `REACT_APP_*` mechanism replaced with working `JIRA_*` env vars.

Done in phase 6 (previously listed here): API error-handling unification
(21 routes on `handleApiError`), time-series scaffold deduplication (8
plugins → one tested helper), kpiResults dual-write fix (derived filtering),
root markdown hygiene (six working notes deleted).

Done in phase 5 (previously listed here): `(db as any)` cast retirement,
typed `transformIssueForKpi` discriminator, chart-data-utils cast/dead-code
cleanup, frontend hook + localStorage consolidation, Electron removal.

Done in phase 4 (previously listed here): cascade-delete deduplication,
age-breakdown deduplication, typed dual Prisma client (foundation), E2E
wired into CI.

---

## Appendix — Historical notes from deleted working-note files

The root-level AI-session working notes were deleted during the phase-6
consolidation. This appendix preserves the only durable facts they carried
that are not otherwise recorded.

### Time-series date-parsing bug (formerly `BUGFIX_TIME_SERIES_DATE_PARSING.md`)

Original symptom: runtime `TypeError: a.date.getTime is not a function` when
displaying time-series trend KPIs. Cause: `TimeSeriesDataPoint.date` is typed
`Date` but arrives as a string after the API JSON round-trip. The first patch
hydrated date strings back to `Date` objects at the frontend boundary only
(`src/app/page.tsx` when setting `kpiResults` from the calculate API), leaving
every other consumer unsafe. Phase 3 (above) fixed this at the type level: the
field was widened to `Date | string` and all six unsafe `.getTime()` sites were
normalized, with regression tests locking in string-date sorting.

### SLA Compliance by Status Trend (formerly `SLA_STATUS_TREND_IMPLEMENTATION.md`)

Implementation notes for the per-status SLA trend plugin. All durable
semantics live in the code and tests: per-status targets with the 40-hour
default fallback (`src/lib/kpi/plugins/time-series/sla/`), the comment-based
SLA clock reset shared with the builtin cards (see phase 1B), and the
incomplete-current-period exclusion used by all weekly trend plugins. Plugin
file locations and IDs in the note were stale at deletion time (plugins moved
to `src/lib/kpi/plugins/time-series/` during consolidation).
