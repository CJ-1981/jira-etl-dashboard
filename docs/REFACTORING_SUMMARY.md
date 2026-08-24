# Refactoring Summary — Technical Debt Cleanup

**Date:** 2026-08-23
**Starting point:** `main` @ `085a0d7` (v0.9.0, docs-only commit)
**Branches:** `refactor/debt-cleanup` (phases 1–3, merged to `main` at `bf1d343`),
`refactor/phase4-deduplication` (phase 4 + defect fixes, pending merge)
**Cumulative delta:** 99 files changed, +3,685 / −11,163 lines (**net −7,478 lines**)

---

## Commit index

| Commit | Description |
|---|---|
| `52d2350` | Phase 1 — security guards, SLA parity fix, dead code removal |
| `a954224` | Phase 2 — unused UI components + dependency pruning |
| `c713c0f` | Phase 3 — honest time-series date typing + shared week bounds |
| `31ec167` | Lint ratchet tightened 2000 → 1068, docs finalized |
| `b6a6edb` | README lint-ratchet update |
| `bf1d343` | **Merge of `refactor/debt-cleanup` into `main`** |
| `7bb3e3d` | Phase 4 — cascade/age-breakdown dedup, typed Prisma client, E2E in CI |
| `13838c0` | Defect fixes — CFD chart recommendation ID, webhook team attribution |

---

## How the work was done

1. A full technical-debt review produced a ranked inventory (security gaps,
   dead code, duplication, type-safety holes, oversized components, hygiene).
2. Execution was phased; each phase ran **TDD-style** (failing test first,
   then the fix) and was split into **parallel workstreams with strictly
   disjoint file ownership**, coordinated so no two streams touched the same
   file.
3. Every phase had to pass the quality gates before commit:
   `npm run type-check` (0 errors), `npm run lint` (warning ratchet),
   full Vitest suite, coverage floors (70% lines / 68% statements /
   60% functions / 53% branches).
4. Feature intactness against `README.md` was verified with the Playwright
   E2E suite plus targeted unit suites after each phase and again after the
   defect fixes.

---

## Phase 1 — Security hardening, metric consistency, dead code (`52d2350`)

**Security**
- Loopback CSRF guard (`isLoopbackOriginRequest`) added to **all** mutating
  API routes — previously only 4 of ~15 were guarded. Covered: dashboard
  views CRUD + bulk import, `jira/extract/cleanup`, `jira/master`
  (POST/DELETE), `jira/poll`, `kpi/plugins/custom` (PUT/DELETE), `pg/export`.
- Webhook's private guard copy consolidated onto the shared guard
  (behavior-preserving, stricter composition kept).
- First real zod validation wired: `StorageConfigSchema` checked before
  caller-supplied `storageConfig` reaches `getDb()`.
- Bulk-import duplicate bug fixed — deterministic sha256 view ids replace
  `Math.random()` (re-imports are now idempotent).
- 53 new tests (43 route tests + 10 schema tests).

**Metric-consistency bug**
- `sla-by-status-excl-clone-weekly.ts` was a 175-line copy-paste of
  `sla-by-status-weekly.ts` that had silently dropped the comment-based SLA
  clock reset its card counterpart uses. Replaced with delegation
  (`useCommentBasedReset` option). The plain trend pair had the same
  divergence — fixed too. Both card/trend pairs now compute SLA identically,
  locked in by parity tests.

**Dead code (−~2,100 lines incl. tests)**
- Removed verified-unused modules: `postgres/client.ts`, `api-middleware.ts`,
  `jql-cache.ts`, `date-cache.ts`, `kpi-worker.ts`, `plugin-cache.ts`,
  `plugin-validator.ts`, `dependency-resolver.ts`, `/api` hello-world stub.
- Removed dead `transformIssue`/`extractTransitions`/`calculateTimeInStatus`
  block from `jira/client.ts` (superseded by `transformIssueForKpi`).
- Benchmark/integration suites trimmed to production `PluginRegistry`
  coverage; orphaned mock fixtures removed.

---

## Phase 2 — UI component and dependency pruning (`a954224`)

- Deleted 28 files: 26 unused shadcn/ui components (each verified
  zero-import before removal) plus orphaned `toast.tsx` and
  `hooks/use-toast.ts`. 21 components remain, all verified used.
- Uninstalled 26 npm packages (89 → 63): `next-intl`, `react-markdown`,
  `react-syntax-highlighter`, `@reactuses/core`, `date-fns`, 14 radix
  packages, `embla-carousel-react`, `input-otp`, `vaul`,
  `react-resizable-panels`, `react-day-picker`, `react-hook-form`,
  `@hookform/resolvers`.
- Verified kept: `cmdk`, `zod`, `sonner` (still referenced).

---

## Phase 3 — Date/week handling (`c713c0f`)

- `TimeSeriesDataPoint.date` widened `Date` → `Date | string`: the old type
  lied after the JSON API round-trip (root cause of the previously patched
  date-parsing crash). The compiler then surfaced exactly 6 unsafe sort
  sites in the time-series plugins; all fixed via `new Date(...)`
  normalization — no `any`, no suppressions. String-date sorting locked in
  by new regression tests.
- New `src/lib/utils/week-boundaries.ts` — `getLocalMondayWeekBounds()` with
  8 unit tests (behavior pinned against a verbatim copy of the legacy
  algorithm). Replaced the triplicated Monday-week math in
  `engine.buildPreprocessed`, `engine.calculate`, and `weekly_ticket_list`.
- `getPeriodKey` default case now zero-pads. The UTC-ISO-week (trends) vs
  local-Monday-week (card buckets) divergence is documented with `@MX:WARN`
  — unifying it is a product decision, deliberately not made.
- **No KPI numbers changed** (all pre-existing tests passed unchanged).

---

## Merge + ratchet (`bf1d343`, `31ec167`, `b6a6edb`)

- Phases 1–3 merged into `main` (`--no-ff`).
- Lint warning ratchet tightened 2000 → 1068 in `ci.yml`, the pre-push hook,
  `CLAUDE.md`, and `README.md`.

---

## Phase 4 — Deduplication, typing, CI hardening (`7bb3e3d`)

**Cascade-delete deduplication (18 new tests)**
- New `src/lib/db-cascade.ts`: transactional `deleteConnectionData()` +
  `deleteEtlRunsWithChildren()` with structural `DbLike`/`TxLike` types,
  zero `any`.
- connections DELETE, master POST-delete, master DELETE, and
  `jira/extract/cleanup` all delegate to it. Three of the four sites were
  previously **non-transactional** (partial deletes possible on failure) —
  all are transactional now.
- Bug fix: master-route deletes now also remove orphaned `kpiResult` rows
  and `dashboardView` rows, matching connections-route semantics; swallowed
  errors are now logged.

**Age-breakdown plugin deduplication (12 new tests)**
- New `src/lib/kpi/utils/age-breakdown.ts` shared by 5 plugins
  (516 → 211 lines). Existing plugin tests pass unchanged —
  byte-equivalent output proven. Kanban variant intentionally kept separate
  (3-level grouping diverges on too many axes).

**Typed dual Prisma client**
- Structural `PrismaModelDelegate`/`DbClient` types exported from `db.ts`;
  `getDb()`/`getDefaultDb()`/`db.client` typed. Both `@ts-ignore` directives
  removed entirely (the dual-client imports proved error-free). Foundation
  for retiring the remaining `(db as any)` casts incrementally.

**E2E wired into CI**
- New `e2e` job in `ci.yml`: installs Chromium with system deps, Playwright
  boots the dev server, HTML report uploaded as artifact. Validated locally
  in CI-simulation mode (22/22 passed).

**Coverage configuration**
- `prisma/generated/` excluded from coverage (generated runtimes entered the
  instrumented set once `db.ts` was imported unmocked by the new db test).

---

## Defect fixes found during post-phase-4 feature review (`13838c0`)

Both pre-existing, both fixed TDD-style (RED confirmed first):

1. **CFD chart recommendation never fired** — `getRecommendedChartType`
   compared against `'cumulative_flow'`, but the real plugin ID is
   `cumulative_flow_trend`; CFD silently fell through to a line chart
   instead of its intended stacked area chart. Fixed + test updated to the
   real ID with time-series data present.
2. **Webhook updates dropped team attribution** — the `webhooks/jira` upsert
   never persisted `issueOwnerTeam` while the extract pipeline does, so
   every webhook-touched ticket silently lost its owner team and
   `open_tickets_by_issue_owner_team` undercounted. Now uses
   `getIssueOwnerTeamField()` + `extractSelectFieldValue()` (full parity with
   the extract pipeline); story points also routed through
   `getStoryPointsField()` instead of a second hardcoded ID. 4 new tests
   lock the mapping parity.

---

## Metrics before → after

| Metric | v0.9.0 (`085a0d7`) | After (`phase 8`) |
|---|---|---|
| Lint warnings (ratchet) | 1,087 (threshold 2,000) | **785** (threshold 785) |
| Type errors | 0 | 0 |
| Unit tests | 918 | **1,238** (all passing) |
| Coverage (lines) | 70.98% | **75.3%** (floor 70%) |
| E2E tests | 22 (local only) | 22, **also in CI** |
| npm dependencies | 89 | 58 |
| shadcn components | 48 | 21 |
| Mutating routes with loopback guard | 4 of ~15 | **all** |
| Transactional cascade deletes | 1 of 4 sites | **all 4** |
| `(db as any)` route casts | ~150 | **0** |
| Routes on shared error handler | 1 of 25 | **22 of 25** |
| KpiDashboard / ExtractPanel / KpiCard | 2,691 / 1,434 / 1,735 | **~1,170 / 274 / 803** |
| Duplicate 5s pollers | 3 | **0** (shared queries) |
| kpiResults store dual-write | yes | **no** (derived filtering) |

---

## Verification performed

- Full gate suite after every phase (type-check / lint / tests / coverage).
- Feature intactness against `README.md` verified twice (after phase 3 and
  after phase 4): all 40 KPI plugin IDs present (35 static + 5 factory
  variants), 22/22 Playwright E2E passing against a live dev server,
  keyboard shortcuts / PNG export / drill-down / saved views / thresholds /
  storage switching / polling / update-only extraction / security headers /
  Jira key validation confirmed in code, tech-stack dependencies confirmed
  present and used.
- The two defects in `13838c0` were the only functional findings; both fixed.

---

## Phase 5 — cast retirement, typing, consolidation, Electron removal

Branch `refactor/phase5-cleanup` (based on v0.10.0 / `d57cac9`), four
parallel workstreams with disjoint file ownership:

- **5A — Retire `(db as any)` casts**: 45 casts removed across 12 route
  files (36 db/prisma casts, 4 `tx` annotations, 5 `DbLike` bridges);
  batch `$transaction` overload added to `DbClient`; narrow local row types
  (`EtlRunRow`, `DashboardViewRow`, …) replace `any` results; routes pass
  `db` to the cascade helpers with zero bridging casts.
- **5B — Typed issue shape**: explicit `KpiIssueInput` union +
  `'fields' in issue` discriminator; `transformIssueForKpi` cast-free
  (25 `as any` eliminated). TDD exposed a latent crash — the old code threw
  on truly flat webhook-shaped issues; the refactor fixes it. Plus
  chart-data-utils: 11 casts removed, dead `_trend` ID list deleted,
  weekly-detail parsing consolidated into `extractWeeklyBreakdown`.
- **5C — Frontend consolidation**: generic `usePersistedList` hook replaces
  two structural clones (public APIs unchanged); dead hook APIs removed;
  keyboard guard extracted to `useGlobalShortcuts`; localStorage keys
  consolidated through `localConfig`/`KEYS` where the test mocks allow.
  35 new hook/guard tests.
- **5D — Electron removal**: `electron/`, four docs, `main` field, electron
  scripts, electron-builder config, and 5 orphaned devDependencies removed
  (218 lock-file packages); caxa remains the only distribution path.

**Gates:** type-check 0 errors; **1,003 tests passing** (68 files);
coverage 71.8% lines (floor 70%); lint **1,032 → 933** (ratchet tightened
to 933 in CI, the pre-push hook, CLAUDE.md, README).

Detailed per-workstream records: `docs/DEBT_CLEANUP.md` (Phase 5 section).
Commit ID: filled in below at commit time.

| Workstream | Commit |
|---|---|
| Phase 5 (all four streams) | `d58fd56` |
| Phase 5 docs finalization | `1420055` |
| Phase 5 merge to main | `c54a3de` |

---

## Phase 6 — error handling, trend scaffold, state fix, doc hygiene

Branch `refactor/phase6-consolidation` (based on `c54a3de`), four parallel
workstreams with disjoint file ownership:

- **6A — API error-handling unification**: 21 routes converted to
  `handleApiError`; helper hardened (substring-404 heuristic removed, typed
  status forwarding); shapes/status codes normalized after consumer checks;
  31 new tests.
- **6B — Time-series scaffold dedup**: new `trend-scaffold.ts` helper; 8
  trend plugins migrated with byte-equivalent output (existing tests
  unchanged); 12 new helper tests.
- **6C — kpiResults dual-write fix**: store slice is now the raw React-Query
  payload; plugin filtering became render-time derived memos; the
  self-referencing effect and its guard ref deleted (6 RED-first tests).
- **6D — Doc hygiene**: six root working-note files deleted, durable facts
  extracted into the `DEBT_CLEANUP.md` appendix.

**Gates:** type-check 0 errors; **1,054 tests passing** (71 files);
coverage **73.5% lines** (floor 70%); lint **933 → 917** (ratchet tightened
to 917 in CI, the pre-push hook, CLAUDE.md, README).

Detailed per-workstream records: `docs/DEBT_CLEANUP.md` (Phase 6 section).

| Workstream | Commit |
|---|---|
| Phase 6 (all four streams) | `6d2eb8f` |
| Phase 6 docs finalization | `a2ee80a` |
| Phase 6 merge to main | `bab3508` |

---

## Phase 7 — component decomposition & consolidation

Branch `refactor/phase7-components` (based on `bab3508`), five parallel
workstreams with disjoint file ownership:

- **7A — ExtractPanel decomposition**: 1,434 lines / 25 `useState` →
  274-line orchestrator + 12 modules under `extract/` (typed
  `PreviewIssue`, `useExtraction`/`usePolling` hooks, presentational
  subcomponents); all 12 `(i: any)` lambdas typed away; 32 new tests;
  original tests unchanged.
- **7B — KpiDashboard decomposition**: 2,614 → **1,265 lines (−52%)**; 8
  widget components + `WidgetCard` chrome + 4 dashboard sections extracted
  under `widgets/`; zero assertion changes; KEYS test-mock fix landed, so
  the last storage-key literals moved into `KEYS`.
- **7C — React Query migration (seven small panels)**: all 21 fetch sites
  converted (query keys, invalidation, mutation semantics preserved); only
  one test needed adaptation.
- **7D — Quote-aware splitter consolidation**: one tested `splitTopLevel`
  helper replacing three copies; zero behavior drift proven by a 105-case
  characterization harness + 48 unit tests.
- **7E — Dead `REACT_APP_*` mechanism removed**: replaced with working
  `JIRA_ISSUE_OWNER_TEAM_FIELD` / `JIRA_STORY_POINTS_FIELD` server-side env
  vars; docs + CLAUDE.md gotcha updated; 6 new tests.

**Gates:** type-check 0 errors; **1,142 tests passing** (75 files);
coverage **74.8% lines** (floor 70%); lint **917 → 846** (ratchet tightened
to 846 in CI, the pre-push hook, CLAUDE.md, README).

Detailed per-workstream records: `docs/DEBT_CLEANUP.md` (Phase 7 section).

| Workstream | Commit |
|---|---|
| Phase 7 (all five streams) | `8f105ca` |
| Phase 7 docs finalization | `76a9d3d` |
| Phase 7 merge to main | `0b91155` |

---

## Phase 8 — final pass

Branch `refactor/phase8-final-pass` (based on `0b91155`), four parallel
workstreams with disjoint file ownership:

- **8A — ChartCard decomposition**: KpiCard.tsx 1,735 → **803 lines**;
  ChartCard ~1,365 → ~467 (renderChart ~780 → ~55-line dispatch); 9 focused
  files under `chart/` (per-type renderers, variant tooltip, zoom module,
  shared legend/SLA-line helpers, config controls); tested
  `mergeTimeSeries`/`hasMultipleTimeSeries` helpers; `any` 51 → 0; 30 new
  tests; rendered output preserved exactly.
- **8B — Poller dedup + React Query completion**: shared
  `useJiraPollQuery`/`usePluginEventsQuery`/`useMasterDatasetQuery`;
  all consumers rewired (public APIs unchanged); dedup proven (two mounted
  consumers → one fetch, one cache entry); post-extraction refreshes via
  invalidation.
- **8C — Client JQL engine extraction**: pure `src/lib/jql-widget-eval.ts`
  with 56 characterization tests; KpiDashboard −98 lines; five latent filter
  bugs pinned by tests and documented for a product decision (not silently
  fixed).
- **8D — One-off script cleanup**: 7 orphaned scripts deleted after
  reference checks; stale `windows-setup.bat` mention removed.

**Gates:** type-check 0 errors; **1,238 tests passing** (78 files);
coverage **75.3% lines** (floor 70%); lint **846 → 785** (ratchet tightened
to 785 in CI, the pre-push hook, CLAUDE.md, README).

Detailed per-workstream records: `docs/DEBT_CLEANUP.md` (Phase 8 section).

| Workstream | Commit |
|---|---|
| Phase 8 (all four streams) | `7b2bb5f` |
| Phase 8 docs finalization | `ad89ce0` |
| Phase 8 hotfix (QueryClient provider placement) | `8e98025` |

### Phase 8 hotfix — "No QueryClient set" startup crash

The phase-8 React Query migration moved `usePollingNotifications` onto
`useQuery`, but the `QueryClientProvider` was rendered *inside* `page.tsx`'s
`Home` component — a hook in the same component can't see a provider it
renders (context flows to descendants only), so `GET /` crashed with a 500.
Fixed by mounting `Providers` (`src/app/providers.tsx`, per-instance
`QueryClient` via `useState`) in `src/app/layout.tsx` above `{children}`,
unwrapping `page.tsx` (fragment return), and SSR-guarding the three shared
query hooks. Verified by the user's exact failing path (dev server `GET /`
→ 200), a 3-test regression suite, the full unit suite (1,241), and E2E
(22/22). Process lesson recorded: **E2E is a required gate after frontend
data-layer changes** (unit tests always wrap renders in a provider, so this
class of regression only surfaces at page-load level).

---

## Remaining debt (tracked in `docs/DEBT_CLEANUP.md`)

The structural cleanup is essentially complete. What remains:
1. Replace `Set`/`Map` values in zustand with plain arrays/records (removes
   clone boilerplate and `instanceof Map` test-compat branches).
2. Product decision: the five latent client-side JQL filter bugs pinned by
   the phase-8C tests (fixing them changes matching behavior users may rely
   on).
3. Product decision: UTC-ISO-week (trends) vs local-Monday-week (card
   buckets) divergence — documented with `@MX:WARN`.
4. Minor: `find-team-field.js` console advice is stale (field IDs are now
   centralized in `field-config.ts`).
