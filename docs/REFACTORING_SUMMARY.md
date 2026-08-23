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

| Metric | v0.9.0 (`085a0d7`) | After (`phase 6`) |
|---|---|---|
| Lint warnings (ratchet) | 1,087 (threshold 2,000) | **917** (threshold 917) |
| Type errors | 0 | 0 |
| Unit tests | 918 | **1,054** (all passing) |
| Coverage (lines) | 70.98% | **73.5%** (floor 70%) |
| E2E tests | 22 (local only) | 22, **also in CI** |
| npm dependencies | 89 | 58 |
| shadcn components | 48 | 21 |
| Mutating routes with loopback guard | 4 of ~15 | **all** |
| Transactional cascade deletes | 1 of 4 sites | **all 4** |
| `(db as any)` route casts | ~150 | **0** |
| Routes on shared error handler | 1 of 25 | **22 of 25** |
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

---

## Remaining debt (tracked in `docs/DEBT_CLEANUP.md`)

Top items, ranked:
1. Decompose `KpiDashboard.tsx` (2.7k lines, 9 copy-paste widget cases),
   `KpiCard.tsx`/`ChartCard` (1.7k), `ExtractPanel.tsx` (25 `useState`
   calls).
2. Route the ~40 raw `fetch` call sites through the configured React Query;
   dedupe the three 5-second pollers (two hit the same endpoint).
3. Replace `Set`/`Map` values in zustand with plain arrays/records (removes
   clone boilerplate and `instanceof Map` test-compat branches).
4. Consolidate the three near-identical quote-aware string splitters
   (`engine-utils.ts` ×2, `custom-formula.ts`).
5. Update KpiDashboard test mocks to export `KEYS` so the remaining storage
   key constants can move into `local-store.ts` `KEYS`.
6. One-off scripts cleanup (`reproduce-issue.mjs`, `backfill-issue-owner-team.js`,
   stale `test-*.bat`); stale `REACT_APP_*` env mechanism in `field-config.ts`.
7. Product decision needed: UTC-ISO-week (trends) vs local-Monday-week (card
   buckets) divergence — documented with `@MX:WARN`, intentionally not
   changed unilaterally.
