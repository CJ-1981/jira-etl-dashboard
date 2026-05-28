# Code Quality Review Report

**Project**: Jira ETL Dashboard
**Date**: 2026-05-28
**Reviewer**: Manager-Quality Agent (automated TRUST 5 audit)
**Scope**: Full codebase at `src/` -- TypeScript, React 19, Next.js 16, Prisma, Vitest

---

## Summary

| Metric | Value |
|--------|-------|
| Total issues found | 41 |
| Critical | 5 |
| High | 14 |
| Medium | 14 |
| Low | 8 |
| TypeScript strictness score | 2/5 |
| Architecture consistency score | 3/5 |
| Test quality score | 2/5 |
| Overall grade | **WARNING** (5 Critical findings require attention) |

---

## 1. TypeScript Type Safety Issues

### CRITICAL: `noImplicitAny` is disabled despite `strict: true`

**File**: `tsconfig.json`, line 13

`"strict": true` is enabled, but `"noImplicitAny": false` immediately follows on line 13, explicitly overriding one of the key strict-mode checks. This means the compiler does not flag inferred `any` types, which is a primary gateway for type-unsafe code. The entire TRUST 5 "Tested" and "Readable" pillars depend on type safety being enforced at compile time.

**Fix**: Change `"noImplicitAny": false` to `"noImplicitAny": true`. The fallout (compile errors) will precisely identify all locations that need proper typing. Start with the utility files (`lib/jira/client.ts`, `lib/kpi/engine-utils.ts`) before tackling the component files.

---

### CRITICAL: 100+ instances of `: any` throughout the codebase

The grep for `: any` returned over 100 matches in a single scan (pagination limited). The highest-density files are:

| File | Lines | Approx. `: any` count |
|------|-------|----------------------|
| `components/dashboard/KpiCard.tsx` | 1,731 | ~40 |
| `components/dashboard/ExtractPanel.tsx` | 1,217 | ~15 |
| `lib/kpi/engine-utils.ts` | ~400 | ~20 |
| `lib/chart-data-utils.ts` | ~500 | ~15 |
| `components/dashboard/jql/JqlFilterSettings.tsx` | ~100 | ~7 |
| `store/app-store.ts` | 245 | 4 |

Representative examples:

- **`store/app-store.ts:32-33`**: `issues?: any[]` in `masterDatasetInfo` -- the central app store knowingly stores untyped data.
- **`store/app-store.ts:79-80`**: `customWidgetResults: Map<string, { context: any; results: KpiCalcResult[] }>` -- the `context` object is completely untyped.
- **`app/page.tsx:71`**: `loadMasterDataset = useCallback(async (connectionId: string, config: any, ...)` -- the storage config is passed as `any`.
- **`app/page.tsx:97`**: `} as any` -- casting the extraction result to any to satisfy the setter.
- **`app/page.tsx:99`**: `} catch (e: any)` -- losing error type information.

**Fix**: Each occurrence needs individual remediation. Priority order:
1. `store/app-store.ts` -- define proper types for `masterDatasetInfo.issues` using the existing `ExtractedIssue` type
2. `lib/chart-data-utils.ts` -- the `ChartDataPoint` interface already uses `[key: string]: any` (line 39); replace with explicit optional fields
3. Component files -- break down and type properly per component

---

### HIGH: 50+ instances of `as any` unsafe type assertions

Key locations:

- **`lib/kpi/engine-utils.ts:88-106`**: The `transformIssueForKpi` function has 15 `as any` casts in 20 lines when building the `TransformedIssue` result. This is the most concentrated type-unsafe block in the codebase. Example pattern repeated throughout:
  ```typescript
  project: (issue.fields as any)?.project?.name || (issue.fields as any)?.project?.key || issue.key.split('-')[0],
  ```

- **`lib/kpi/engine.ts:199`**: `(issue as any).created` -- the `filterIssuesByPeriod` method casts entire issues to `any` to access dates.

- **`lib/chart-data-utils.ts`**: 10+ instances of `as any` for accessing `ticketKeys`, `isComplete`, and `timeSeries` properties.

- **`lib/db.ts:250`**: `{} as any` -- browser compatibility proxy that returns an empty object with no type safety.

- **`app/api/dashboard/views/[id]/route.ts:28`**: `(db as any).$transaction(async (tx: any) => ...)` -- Prisma client cast to `any` because the multi-provider type isn't properly resolved.

- **`app/` API routes**: 6+ instances of `(db as any)` in dashboard view and Jira routes.

**Root cause**: The dual-database Prisma setup (SQLite + PostgreSQL) uses `@ts-ignore` for imports (see below), which cascades into type-erased usage throughout the API layer.

---

### HIGH: `@ts-ignore` on Prisma generated client imports

**File**: `src/lib/db.ts`, lines 4-7

```typescript
// @ts-ignore
import { PrismaClient as SQLiteClient } from '../../prisma/generated/sqlite';
// @ts-ignore
import { PrismaClient as PostgresClient } from '../../prisma/generated/postgresql';
```

These `@ts-ignore` comments silence import errors, but the root cause (the generated clients not being found or not matching the expected module structure) should be fixed rather than suppressed. The generated client paths should be aliased, or a proper facade should be built that doesn't require suppressing type errors at the import boundary.

---

### MEDIUM: `(db as any)` patterns in API routes

**Files**: `app/api/dashboard/views/[id]/route.ts:28,66`, `app/api/dashboard/views/route.ts:52`, `app/api/dashboard/views/bulk/route.ts:56`, `app/api/dashboard/views/[id]/default/route.ts:27`, `app/api/jira/test-issue/route.ts:18`

Every dashboard view API route casts the database client to `any` before calling methods. This is a direct consequence of the `@ts-ignore` Prisma import silencing. The `DbClient` union type (`SQLiteClient | PostgresClient`) doesn't resolve to a common interface that Prisma's transaction and query methods recognize.

**Fix**: Create a typed database facade or use Prisma's `PrismaClient` interface as the common type rather than the specific generated types.

---

### MEDIUM: `noUncheckedIndexedAccess` not enabled

**File**: `tsconfig.json`

The `noUncheckedIndexedAccess` compiler option is not set. Combined with `noImplicitAny: false`, this means array indexing and object property access can silently be `undefined` without the compiler warning. This is particularly risky in the KPI engine where array indexing on `timeSeries`, `details`, and issue arrays is common.

---

### LOW: `extractSelectFieldValue` uses untyped parameter

**File**: `src/lib/jira/client.ts:612`

```typescript
export function extractSelectFieldValue(field: any): string | null {
```

This is a widely-used utility function (called from `engine-utils.ts`, `engine.ts`, and multiple plugins) that takes `any` as input. The actual type should be `unknown` with proper narrowing or a union of known Jira field types.

---

## 2. Code Smells and Anti-patterns

### CRITICAL: `KpiDashboard.tsx` at 3,077 lines -- extreme component size

**File**: `src/components/dashboard/KpiDashboard.tsx`

This single file is 3,077 lines long. It handles:
- Dashboard layout orchestration
- Date range filtering
- Global filter management
- Widget addition/removal/resize
- KPI calculation triggering
- Drill-down state management
- JQL filter management
- Export functionality
- Saved views management
- Submenu toggling

**Fix**: Decompose into focused sub-components and custom hooks:
- `KpiDashboardLayout` -- grid layout and responsive behavior
- `KpiDashboardFilters` -- date range + global filters
- `KpiDashboardWidgetPanel` -- widget management
- `useDashboardState` -- combine widget order, drill-down, expanded states
- Move chart card rendering logic into `KpiCard.tsx` (many items already there)

---

### HIGH: `KpiCard.tsx` at 1,731 lines -- oversized single-card component

**File**: `src/components/dashboard/KpiCard.tsx`

The chart card component contains multiple custom tooltip renderers (line/area, bar, pie), legend rendering, JQL filter management, resize handlers, drag-to-reorder, and export logic all in one file. The 40+ `any` casts are concentrated in the tooltip and chart data transformation sections.

**Fix**: Extract:
- `ChartTooltips.tsx` -- all custom Recharts tooltip components
- `ChartLegends.tsx` -- legend rendering
- `JqlFilterPopover.tsx` -- JQL filter editing UI
- `CardResizeControls.tsx` -- resize/width controls

---

### HIGH: `ExtractPanel.tsx` at 1,217 lines

**File**: `src/components/dashboard/ExtractPanel.tsx`

Contains data extraction controls, issue list display, sorting, filtering, and status grouping all in one component. Lines 939-1067 contain dense array processing with many `any` type annotations.

---

### HIGH: Massive type coercion chain in `engine-utils.ts`

**File**: `src/lib/kpi/engine-utils.ts:88-106`

The `transformIssueForKpi` function has 15 inline `as any` casts when mapping Jira issue fields to the `TransformedIssue` type. This pattern of `(issue.fields as any)?.fieldname || (issue as any).fieldname` indicates the `JiraIssue` type doesn't properly model the actual data shape. The Jira REST API can return fields in either `.fields` sub-object or directly on the issue (depending on whether it came from the full REST API or a stored/simplified representation).

**Fix**: Create a discriminated union or normalization layer that standardizes the Jira issue shape before it reaches the KPI engine. Add a `normalizeIssue(raw: RawJiraIssue): NormalizedJiraIssue` function at the boundary.

---

### MEDIUM: `chart-data-utils.ts` has cross-layer leakage -- accesses localStorage directly

**File**: `src/lib/chart-data-utils.ts:414-488`

The `lib/` directory contains "library" code, yet `chart-data-utils.ts` directly accesses `localStorage` (a browser-only API) to read plugin configurations. This creates:
1. A testing problem -- tests must mock `localStorage`
2. A coupling problem -- library code depends on browser runtime details
3. A dependency inversion -- data should flow from the component layer down into utilities, not the reverse

**Fix**: Inject plugin configurations as parameters rather than reading from localStorage inside the utility.

---

### MEDIUM: `console.log` statements in production code paths

While many `console.log` calls are conditionally guarded (`if (isDev)`), several are not:
- `lib/db.ts:179` -- unconditional `console.log` on every DB initialization
- `lib/logger.ts:62` -- the Logger class always writes to `console.log` regardless of environment
- `hooks/useKpiCalculations.ts:191,202,220` -- unconditional debug logs in calculation lifecycle
- `components/dashboard/KpiCard.tsx:579,583` -- debug logs for JQL filter operations

---

### LOW: Single `catch(e){}` (empty catch block)

**File**: `src/app/layout.tsx:57`

The theme initialization inline script has `catch(e){}` which silently swallows all localStorage access errors. While this is in an inline script (limited scope), a comment explaining why the error is intentionally ignored would improve traceability.

---

## 3. Architecture and Organization Issues

### HIGH: No test coverage thresholds configured

**File**: `vitest.config.ts`

The coverage configuration has no `threshold` section. Coverage is collected but never enforced. The coverage exclude list only excludes `src/types/**`, which is the only types directory (just 100 lines). Given the project has ~40+ TypeScript source files, the lack of enforced thresholds means coverage can degrade silently.

**Recommended thresholds** (per TRUST 5 Tested pillar):
```typescript
coverage: {
  thresholds: {
    statements: 60,  // Start conservative, raise to 80 over time
    branches: 50,
    functions: 60,
    lines: 60,
  },
}
```

---

### MEDIUM: No barrel exports (`index.ts` files)

The project uses no barrel export files anywhere. All imports use direct file paths (e.g., `import { KpiEngine } from '@/lib/kpi/engine'`). While this avoids the circular dependency risk of barrel files, it means:
- Deep import paths are verbose (`from '../__tests__/mocks'` in test files)
- No clear public API surface for each module
- Refactoring file locations requires updating all importers

**Decision**: Barrel exports are a reasonable choice to omit in a project this size, but adding `index.ts` files for the most-imported modules (`lib/kpi/`, `hooks/`, `components/dashboard/`) would improve maintainability.

---

### MEDIUM: Single `src/types/dashboard.ts` file pattern

**File**: `src/types/dashboard.ts` (100 lines)

All shared types live in a single 100-line file, which is manageable at this size. However, it re-exports types from `lib/config/local-store.ts` (line 1), creating a cross-layer dependency. The file mixes domain concepts: `ExtractedIssue`, `KpiCalcResult`, `ChartConfig`, `DashboardView`, `DashboardViewState`. As the project grows, these should be split by domain.

---

### MEDIUM: `'use client'` directives on 37 files (all shadcn/ui components)

All 37 shadcn/ui components have `'use client'`, which is correct since they use React hooks and browser APIs. No server-side rendering violations were found. All dashboard components and hooks that need client-side behavior have appropriate directives.

---

### LOW: `app-store.ts` at 245 lines -- reasonable but growing

**File**: `src/store/app-store.ts`

The Zustand store is 245 lines and covers app state, connections, extraction results, KPI dashboard state, global filters, hidden dimensions, chart configurations, JQL filters, saved views, widget titles, collapsed widgets, and drill-down state. As state management needs grow, consider splitting into domain-specific slices using Zustand's slice pattern.

---

### LOW: `Logger` class is defined but not widely used

**File**: `src/lib/logger.ts`

A well-designed Logger class exists with log levels, in-memory buffer, and JSON export. However, most files use raw `console.log`/`console.error` calls instead. The logger is imported and available but adoption is inconsistent.

---

## 4. Testing Quality Assessment

### Test Files Found: 17

**Hook tests** (5 files):
- `hooks/__tests__/useDrillDown.test.ts`
- `hooks/__tests__/useJqlFilters.test.ts`
- `hooks/__tests__/useKpiCalculations.test.tsx`
- `hooks/__tests__/usePeriodAnalysis.test.ts`
- `hooks/__tests__/usePluginVisibility.test.ts`

**KPI infrastructure tests** (7 files):
- `lib/kpi/__tests__/benchmark.test.ts`
- `lib/kpi/__tests__/dependency-resolver.test.ts`
- `lib/kpi/__tests__/integration.test.ts`
- `lib/kpi/__tests__/plugin-cache.test.ts`
- `lib/kpi/__tests__/plugin-registry.test.ts`
- `lib/kpi/__tests__/plugin-validator.test.ts`
- `lib/kpi/__tests__/types.test.ts`

**Plugin unit tests** (4 files):
- `lib/kpi/plugins/builtin/assignee/__tests__/open-tickets-by-issue-owner-team.test.ts`
- `lib/kpi/plugins/builtin/throughput/__tests__/closed-tickets-by-priority.test.ts`
- `lib/kpi/plugins/builtin/throughput/__tests__/open-tickets-by-status.test.ts`
- `lib/kpi/plugins/builtin/throughput/__tests__/open-tickets-kanban.test.ts`

**Integration test** (1 file):
- `components/dashboard/__tests__/KpiDashboard.integration.test.tsx`

### Coverage Gaps (Critical Paths Without Tests)

| Critical Path | Test Coverage | Risk |
|--------------|---------------|------|
| ETL pipeline (Jira extract, transform, load) | **NONE** | HIGH -- core data pipeline is untested |
| KPI calculation engine (`kpi/engine.ts`) | **NONE** (only plugin infra tested) | HIGH -- the main engine class has zero direct tests |
| API route handlers (all `/api/**` routes) | **NONE** | HIGH -- 12+ API routes with no integration tests |
| Zustand store (`store/app-store.ts`) | **NONE** | HIGH -- state mutations are untested |
| Database layer (`lib/db.ts`) | **NONE** | MEDIUM -- DB connection and client management |
| Error handling utilities (`lib/api-error.ts`) | **NONE** | MEDIUM -- custom error classes and middleware |
| Jira client (`lib/jira/client.ts`) | **NONE** | MEDIUM -- API client with complex field parsing |
| JSON config store (`lib/config/local-store.ts`) | **NONE** | MEDIUM -- localStorage operations |
| Chart data utilities (`lib/chart-data-utils.ts`) | **NONE** | MEDIUM -- complex data transformations |
| KPI plugins (other builtins: SLA, quality, turnaround) | **Partial** (3 of 16 have tests) | MEDIUM |
| German holidays (`lib/holidays/german-holidays.ts`) | **NONE** | LOW -- locale-specific, data-driven |
| Dashboard UI components | **Partial** (1 integration test) | LOW |

### Test Quality Observations

**Positive findings**:
- `useKpiCalculations.test.tsx` has 29 tests across 10 suites -- good coverage for the hook
- Tests use proper `@testing-library/react` patterns with `renderHook`, `waitFor`, `act`
- Mock setup is clean and reusable (wrapper factories, test helpers)
- Plugin tests verify behavior (actual outputs) rather than implementation details
- Benchmark tests are conditionally activated via `RUN_BENCHMARKS` env var -- good practice

**Negative findings**:
- Plugin test files use extensive `as any` casting for mock data (e.g., `customIssues as any` in `open-tickets-kanban.test.ts:29` and `useKpiCalculations.test.tsx:97` using `as any`)
- No snapshot testing -- this is actually a positive; the project correctly avoids snapshot overuse
- Integration test only covers `KpiDashboard` -- no ETL or API integration tests
- No edge case testing for error states in plugin tests
- No tests for `filterIssuesByPeriod` or `calculateAll` -- the two most complex engine methods

---

## 5. Error Handling Assessment

### Positive Patterns

- **Custom error hierarchy** (`lib/api-error.ts`): `ApiError` base class with `ValidationError`, `AuthenticationError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `InternalServerError` subclasses. Well-designed with proper status codes.
- **Consistent error response format**: `{ success: false, error: string, details?: unknown }` used across API routes.
- **Error type guards**: `isApiError()` and `isError()` functions for type-safe error handling.
- **`handleApiError()` utility**: Centralized error-to-NextResponse conversion with Zod error special-casing.
- **Rate limiting**: `checkRateLimit()` and `withRateLimit()` provide in-memory rate limiting with configurable windows.
- **Input validation**: Zod schemas in `lib/validation/schemas.ts` with `validateBody()`, `validateQuery()`, and `validateRequest()` helpers.

### Issues

- **`catch(e){ }` (empty block)** in `app/layout.tsx:57` -- swallows localStorage errors silently
- **Most API routes use try/catch + generic 500**: While the error handling infrastructure exists, most routes do manual try/catch instead of using `handleApiError()` or `withErrorHandler()`
- **No React Error Boundary wrapping**: `KpiErrorBoundary.tsx` exists but is only used in one location. Other complex components (`ExtractPanel`, `KpiCard`) are not wrapped in error boundaries.
- **`console.error` used directly instead of Logger**: Error reporting is ad-hoc rather than going through the centralized Logger

---

## 6. Console and Debug Code

### Legacy debug code: 0 instances

No `debugger` statements, `// TODO`, `// FIXME`, `// HACK`, or `// XXX` comments were found. The codebase is clean of flagged work-in-progress markers.

### Console statements: ~55 instances

Breakdown by category:
- **Development-guarded logs**: 7 instances in `app/page.tsx` (prefixed with `if (isDev)`) -- acceptable
- **Structured error logs (prefixed with `[Component]`):** ~30 instances -- generally acceptable for production debugging
- **Unconditional info logs**: ~8 instances that should be `debug` level or removed:
  - `lib/db.ts:179` -- Databse URL logging
  - `hooks/useKpiCalculations.ts:191,202,220` -- Calculation lifecycle logs
  - `components/dashboard/KpiCard.tsx:579,583` -- JQL filter operation logs
  - `lib/kpi/engine.ts:149` -- Plugin loading summary

**Recommendation**: Adopt the existing `Logger` class (from `lib/logger.ts`) consistently. Replace raw `console.log` calls with `logger.debug()` for development and `logger.info()` for important operational events. The Logger already has environment-aware filtering.

---

## 7. Code Consistency Observations

### Positive findings

- **Import ordering**: Consistent pattern -- third-party imports first, then local imports using `@/` alias
- **Export patterns**: Named exports are the norm. `export default` used appropriately for Next.js pages and KPI plugin definitions (which is the standard plugin pattern)
- **CSS approach**: Consistent use of Tailwind CSS utility classes. No CSS modules or inline styles found outside of chart configuration
- **State management**: Clear separation -- Zustand for global app state, TanStack Query for server state (KPI calculations), local React state for ephemeral UI state
- **API route patterns**: Consistent `NextResponse.json()` usage with `{ success, error }` envelope

### Issues

- **`export default` vs named export inconsistency**: KPI plugins use `export default`, while utility functions use named exports. This is justified by the plugin pattern but creates two different import styles throughout the codebase.
- **Logger adoption**: Only used in `lib/logger.ts` itself -- all other files use raw `console.*` calls

---

## 8. TRUST 5 Dimension Assessment

### Tested: WARNING
- Test coverage: ~17 test files, but zero coverage on critical ETL pipeline, KPI engine core, and all API routes
- No coverage thresholds enforced
- Plugin tests show good patterns but use excessive `as any` for mock data
- Score: 2/5

### Readable: WARNING
- Giant component files (3,077-line KpiDashboard, 1,731-line KpiCard) severely impact readability
- Extensive `any` usage obscures intent -- a developer reading `config: any` cannot know what data is expected
- Naming is generally clear -- components, hooks, and utilities have descriptive names
- Comments explain WHY (not WHAT) in most cases -- good MX tag usage for context
- Score: 3/5

### Unified: PASS
- Consistent directory structure: `components/ui/` (shadcn), `components/dashboard/` (domain), `lib/` (utilities), `hooks/` (custom hooks)
- Consistent import patterns using `@/` alias
- Consistent Tailwind CSS styling
- Consistent API response format
- Score: 4/5

### Secured: WARNING
- Input validation schemas exist (`lib/validation/schemas.ts`) with proper Zod validation
- Rate limiting is implemented in `api-error.ts`
- Custom plugin code execution (`app/api/kpi/plugins/custom/route.ts`) has path sanitization
- However: `extractSelectFieldValue` and `engine-utils.ts` use `any`-typed inputs at security boundaries
- The empty `catch(e){}` in `layout.tsx` is a minor security smell
- Score: 3/5

### Trackable: PASS
- Recent git history shows conventional commit messages with descriptive subjects
- No TODO/FIXME/HACK markers -- work tracking is handled through git, not code comments
- MX tags provide in-code traceability for architectural decisions
- Score: 4/5

---

## 9. Recommendations Summary (Priority-Ordered)

### Critical (address immediately)

1. **Enable `noImplicitAny`** -- Change `tsconfig.json` line 13 to `true`. Fix the resulting compile errors by adding proper types. This is the single highest-impact improvement.

2. **Decompose `KpiDashboard.tsx`** (3,077 lines) -- Split into `KpiDashboardLayout`, `KpiDashboardFilters`, `KpiDashboardWidgetPanel`, and extract state management into `useDashboardState`.

3. **Add test coverage for KPI engine core** -- Write unit tests for `KpiEngine.calculateAll()`, `filterIssuesByPeriod()`, and the plugin lifecycle. This is the most critical untested path.

4. **Add test coverage for API routes** -- Write integration tests for at minimum the `/api/kpi/plugins`, `/api/kpi/plugins/custom`, and `/api/jira/extract` routes.

5. **Add test coverage for the Zustand store** -- Write unit tests for `app-store.ts` state mutations, especially those that cascade into multiple state updates.

### High (address in next iteration)

6. **Fix Prisma `@ts-ignore` in `db.ts`** -- Create a proper typed facade or use a common `PrismaClient` interface rather than the generated-specific types.

7. **Normalize Jira issue types** -- Create a `NormalizedJiraIssue` type and a normalization layer so `engine-utils.ts` no longer needs 15 `as any` casts.

8. **Decompose `KpiCard.tsx`** (1,731 lines) -- Extract chart tooltips, legends, resize controls, and JQL filter into separate components.

9. **Decompose `ExtractPanel.tsx`** (1,217 lines) -- Extract issue list rendering, sorting, and filtering into dedicated components.

10. **Add coverage thresholds to `vitest.config.ts`** -- Start with 60% statements/branches/functions/lines. Raise to 80% over subsequent sprints.

11. **Remove `console.log` from `lib/db.ts:179`** -- Move to `logger.debug()` or guard with environment check.

12. **Add tests for `lib/api-error.ts`** -- The error handling infrastructure itself should be tested (formatting, status codes, Zod special-casing).

13. **Add tests for `lib/chart-data-utils.ts`** -- Chart transformation logic has complex branching and should be verified.

### Medium (address within next 2-3 sprints)

14. **Type `customWidgetResults` properly** in `app-store.ts` -- Replace `any` in `Map<string, { context: any; results: KpiCalcResult[] }>` with a typed context.

15. **Type `masterDatasetInfo.issues` as `ExtractedIssue[]`** in `app-store.ts` instead of `any[]`.

16. **Remove `localStorage` access from `chart-data-utils.ts`** -- Inject plugin config as parameters.

17. **Adopt `Logger` class consistently** -- Replace raw `console.*` calls throughout hooks and components with `logger.debug()`/`logger.info()`/`logger.error()`.

18. **Wrap complex components in error boundaries** -- Add `<KpiErrorBoundary>` around `ExtractPanel` and individual `KpiCard` instances.

19. **Add `noUncheckedIndexedAccess` to `tsconfig.json`** -- Start with `false` and a separate build step to assess impact, then enable.

### Low (backlog items)

20. **Add comment to empty catch in `layout.tsx:57`** -- Explain why localStorage error is intentionally ignored.

21. **Type `extractSelectFieldValue` parameter as `unknown`** -- Use type narrowing instead of `any`.

22. **Consider barrel exports** for `lib/kpi/`, `hooks/`, and `components/dashboard/`.

23. **Split `src/types/dashboard.ts`** by domain when files grow beyond 200 lines.

24. **Consider Zustand store slices** when `app-store.ts` exceeds 300 lines.

---

## 10. What Is Working Well

The project has several strong engineering practices worth acknowledging:

1. **KPI plugin architecture is excellent** -- The plugin registry, validation, dependency resolution, and caching infrastructure is well-designed with clean abstractions (`KpiPlugin` interface, `KpiContext`, separation of concerns).

2. **Error handling infrastructure is solid** -- The `ApiError` hierarchy, `handleApiError()`, rate limiting, and Zod validation helpers form a comprehensive error handling strategy. It just needs more consistent adoption.

3. **MX tag adoption is organic** -- `@MX:NOTE`, `@MX:ANCHOR`, `@MX:REASON`, and `@MX:WARN` tags exist in key architectural files (`engine.ts`, `engine-utils.ts`, `app-store.ts`, `db.ts`, `KpiDashboard.tsx`). These provide valuable context for future developers.

4. **Zod validation schemas are comprehensive** -- 267 lines of well-organized validation schemas covering all major entities (Jira connections, PostgreSQL connections, ETL pipelines, settings, KPI calculations).

5. **Weekly caching optimization** -- The `WeeklyIssueCache` in `engine.ts` and `TransformCache` in `engine-utils.ts` show thoughtful performance engineering with proper cache eviction.

6. **No TODOs or FIXMEs in code** -- Work is tracked externally via git, not through code comments.

7. **Test helpers are well-structured** -- `createTestDates()`, `createTestFilters()`, `createWrapper()`, and `createMockContext()` patterns in test files are clean and reusable.