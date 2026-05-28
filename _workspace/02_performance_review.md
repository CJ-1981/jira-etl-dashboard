# Performance Audit Report: Jira ETL Dashboard

**Date:** 2026-05-28
**Version:** 0.2.0
**Stack:** Next.js 16.1.7, React 19, TypeScript 5, Prisma 6.11.1, Zustand 5.0.6, TanStack Query 5.82.0, Recharts 2.15.4

---

## Executive Summary

The Jira ETL Dashboard is a feature-rich analytics application with a solid caching architecture in its KPI engine layer and good database chunking patterns in its ETL pipeline. However, significant performance risks exist in three areas: the massive KpiDashboard component (3,078 lines), the essentially static TanStack Query caching strategy, and the absence of any code-splitting or lazy loading. The application would benefit most from component decomposition, dynamic imports, and a tiered cache invalidation strategy.

**Overall Risk Level: Medium**
**Critical Issues: 3**
**High Priority: 8**
**Medium Priority: 12**
**Low Priority: 7**

---

## 1. Bundle and Dependency Analysis

### 1.1 Current State

| Metric | Value |
|--------|-------|
| Production dependencies | 115 packages |
| Dev dependencies | 28 packages |
| Total dependencies | 143 packages |
| Bundler | Webpack (via Next.js) |
| Split chunks | vendor, common (2 groups) |
| Dynamic imports | 0 (none found anywhere in codebase) |
| Tree shaking | Webpack default (no sideEffects config in package.json) |
| Image optimization | Not configured |
| React Strict Mode | Disabled (`reactStrictMode: false`) |
| Build analysis | Available via `ANALYZE=true` but not in regular workflow |

### 1.2 Heavy Dependencies Identified

| Package | Estimated Size | Usage |
|---------|---------------|-------|
| recharts 2.15.4 | ~500KB gzipped | Charts in KpiCard, KpiDashboard |
| framer-motion 12.23.2 | ~150KB gzipped | Animations in KpiDashboard |
| @radix-ui/* (30 packages) | ~200KB total | UI primitives throughout |
| react-syntax-highlighter 15.6.1 | ~200KB gzipped | Code highlighting |
| react-markdown 10.1.0 | ~100KB gzipped | Markdown rendering |
| @mdxeditor/editor 3.39.1 | ~300KB gzipped | MDX editor |
| pptxgenjs 4.1.0 | ~150KB gzipped | PowerPoint export |
| react-virtuoso 4.18.6 | ~50KB gzipped | Virtualized lists |
| @tanstack/react-table 8.21.3 | ~50KB gzipped | Data tables |
| dnd-kit (3 packages) | ~40KB gzipped | Drag and drop |

**Total estimated heavy dependency weight: ~1.7MB gzipped**

### 1.3 Webpack Configuration Analysis

The `next.config.ts` splitChunks configuration creates only two cache groups:
- `vendor`: all node_modules into one chunk (priority 20)
- `common`: shared code across chunks (priority 10)

This means every route loads the entire vendor bundle regardless of what it actually needs. Given the 143 dependencies, this single vendor chunk is likely very large.

There is no `sideEffects` field in `package.json`, which prevents webpack from performing aggressive tree shaking on packages that support it.

### 1.4 Findings

**CRITICAL: No code splitting or lazy loading (F-1.4-01)**
- Zero dynamic imports found anywhere in the codebase
- The entire application is loaded as a single bundle
- All 115 production dependencies are loaded on initial page visit regardless of which tab the user is on
- Impact: Long initial load time, especially in Electron where the bundle is loaded from disk

**HIGH: Missing per-route chunk splitting (F-1.4-02)**
- splitChunks only groups into `vendor` and `common`
- No route-level or page-level code splitting
- Heavy packages like react-syntax-highlighter, pptxgenjs, and @mdxeditor/editor are loaded even if the user never visits those features

**HIGH: No tree-shaking optimization (F-1.4-03)**
- No `sideEffects: false` in package.json
- Several packages (date-fns, lodash-like utilities) could benefit from selective imports but are likely fully bundled

**MEDIUM: React Strict Mode disabled (F-1.4-04)**
- `reactStrictMode: false` suppresses double-render detection during development
- Prevents early detection of side effects in render, impure components, and stale closure bugs
- Not a production performance issue, but a development safety concern

---

## 2. React Rendering Performance

### 2.1 Current State

| Metric | Value |
|--------|-------|
| React.memo usage | 3 components (ExtractPanel, KpiCard, KpiDataTable) |
| useMemo/useCallback usage | 18 files |
| Largest component | KpiDashboard.tsx (3,078 lines) |
| Second largest | KpiCard.tsx (1,731 lines) |
| useEffect hooks in KpiDashboard | ~10 |
| Inline function definitions | Common in JSX render paths |
| State slices in Zustand | ~30 |

### 2.2 Component Analysis

**KpiDashboard.tsx (3,078 lines) -- Critical Risk**

This single component:
- Imports ~30 shadcn/ui components
- Imports ~14 Recharts components
- Imports framer-motion, html-to-image, react-virtuoso
- Uses 7+ custom hooks (useAppStore with 30+ destructured values, useDrillDown, usePeriodAnalysis, usePluginVisibility, useJqlFilters, useKpiCalculations, useWidgetOrder)
- Contains ~10 useEffect hooks
- Has inline event handlers (handleUpdateChart, handleAddChart, handleRemoveChart)
- Computes filter options by iterating all masterDatasetInfo.issues

Any state change in this component or any of its hooks triggers a full re-render of the entire tree. Despite React.memo on KpiCard, the parent re-render will still cause reconciliation of all children.

**KpiCard.tsx (1,731 lines) -- High Risk**

This React.memo-wrapped component:
- Handles multi-chart rendering (bar, line, pie, area) with merging logic
- Manages drag-to-zoom state (mouseDown/mouseMove/mouseUp)
- Executes PNG export via html-to-image
- Defines custom tooltip functions in render path (new function references each render)
- Has conditional Bar rendering based on data structure detection
- Contains ~6 console.log calls in production paths

The React.memo wrapper helps prevent unnecessary re-renders, but the inline tooltip function definitions create new references on every render, which could break memoization of child components.

**Inline Function Patterns**

Throughout the codebase, tooltip renderers, formatters, and event handlers are defined inline in JSX. While React 19's compiler may optimize some cases, these patterns can still cause unnecessary child re-renders when passed as props.

### 2.3 Findings

**CRITICAL: KpiDashboard is a monolithic component (F-2.3-01)**
- 3,078 lines with no sub-component extraction
- 10 useEffect hooks create complex dependency chains
- Any state change causes full tree reconciliation
- Impact: Slow interaction response, especially with many widgets

**HIGH: Inline tooltip/renderer functions in KpiCard (F-2.3-02)**
- Custom Bar, Line, Pie, Area tooltips defined inline
- New function references on every render
- Breaks React.memo optimization for child chart components

**HIGH: filterOptions computation iterates all issues (F-2.3-03)**
- Memoized computation in KpiDashboard iterates `masterDatasetInfo.issues`
- With large datasets (thousands of issues), this becomes expensive
- Runs on every dependency change

**MEDIUM: Only 3 components use React.memo (F-2.3-04)**
- Many presentational components could benefit from memoization
- chart.tsx, sidebar.tsx, and several UI components are good candidates

**MEDIUM: framer-motion AnimatePresence on multiple elements (F-2.3-05)**
- AnimatePresence tracks enter/exit animations for child components
- Layout animations can be expensive with many animated children

---

## 3. Data Fetching Efficiency (CRITICAL Focus)

### 3.1 Current State

| Metric | Value |
|--------|-------|
| HTTP client | Native fetch (no axios) |
| Data fetching library | TanStack Query 5.82.0 |
| staleTime | Infinity |
| gcTime | Infinity |
| refetchOnWindowFocus | false |
| Retry on error | false |
| Polling interval | 5 minutes (300,000ms) |
| Request timeout | 120 seconds (AbortController) |
| Jira extraction | Sequential pagination (do-while) |
| Jira retries | 3 retries with 60s timeout |
| Rate limiting | 429 awareness with configurable delay |

### 3.2 TanStack Query Configuration Deep Dive

The `useKpiCalculations` hook configures TanStack Query with:
```typescript
staleTime: Infinity,
gcTime: Infinity,
refetchOnWindowFocus: false,
retry: false,
```

This means:
- Data is considered fresh forever (`staleTime: Infinity`)
- Cache is never garbage collected (`gcTime: Infinity`)
- No automatic refetch on tab focus
- No retry on failure
- Manual refetch only via `triggerCalculation()` or the 5-minute polling interval

The practical effect is that all KPI data is fetched once and cached permanently. The only way to get fresh data is:
1. The 5-minute polling interval (if webhooks are enabled in settings)
2. User manually triggers recalculation
3. Application hard-reload

### 3.3 Jira Extraction Pipeline

The `JiraClient.extractIssues()` method uses sequential pagination:
```
fetch page 1 -> process -> fetch page 2 -> process -> ...
```

There is no concurrent request pattern for the Jira API. Each page must complete before the next begins. With a typical batch size of 50 and potential datasets of thousands of issues, extraction time scales linearly with issue count.

The fetchWithRetry mechanism provides resilience:
- 3 retry attempts
- 60-second timeout per request
- 429 (rate limit) awareness with configurable backoff

However, for large projects (10,000+ issues), at 50 per page with ~1s per request (including rate limiting), extraction could take 200+ seconds.

### 3.4 KPI Calculation API

The `/api/kpi/calculate` endpoint:
- Creates a fresh KpiEngine instance per request (avoids singleton mutation)
- Loads issues from DB by rawData parsing (avoids serializing issues in POST body)
- Uses `calculateAll()` which pre-computes filter, transform, and weekly breakdown once
- Registers custom plugins per-request (clean isolation)

This is well-designed for correctness. The fresh engine instance prevents cross-request contamination.

### 3.5 Findings

**CRITICAL: Static cache with no invalidation strategy (F-3.5-01)**
- `staleTime: Infinity, gcTime: Infinity` means data never refreshes automatically
- 5-minute polling only works when webhooks are enabled
- No cache-busting when new ETL data is extracted
- Users must manually recalculate or wait for the 5-minute poll

**HIGH: Sequential Jira API pagination (F-3.5-02)**
- No concurrent page fetching despite Jira Cloud API supporting it
- Linear time scaling with issue count
- Bottleneck for large projects

**HIGH: Full issue serialization in extraction response (F-3.5-03)**
- The extract API returns all extracted issues in the response body
- For large extractions (10,000+ issues), the JSON payload could be 10MB+
- This is then stored in Zustand (`extractionResult.issues`)

**MEDIUM: Client-side JQL filtering before server call (F-3.5-04)**
- `calculateWidgetJql` filters issues client-side first, then calls the server API
- Double filtering adds latency without benefit if the server is the source of truth

**MEDIUM: No request deduplication for concurrent calculations (F-3.5-05)**
- While `isCalculatingRef` prevents duplicate triggers, multiple widgets requesting custom JQL calculations in quick succession could cause redundant API calls

---

## 4. Memory and Leak Detection

### 4.1 Current State

| Component | Type | Max Size | Garbage Collectable |
|-----------|------|----------|---------------------|
| WeeklyIssueCache | Map (LRU) | 5 entries | Yes (manual eviction) |
| compiledFnCache | WeakMap | Unlimited | Yes (weak references) |
| PluginCache | Map (LRU) | 100 entries | Yes (TTL + manual) |
| TransformCache | Map | 5,000 entries | No (never cleared) |
| jqlResultCache (Zustand) | Map | Unlimited | No (manual only) |
| customWidgetResults (Zustand) | Map | Unlimited | No (manual only) |
| extractionResult.issues (Zustand) | Array | Unlimited | No (manual only) |
| masterDatasetInfo.issues (Zustand) | Array | Unlimited | No (manual only) |

### 4.2 Zustand Store Memory Risk

The Zustand store (`app-store.ts`) holds ~30 state slices, several of which can accumulate large data:

- `extractionResult.issues`: Full JiraIssue array (potentially 10,000+ objects with changelogs)
- `masterDatasetInfo.issues`: Another copy of issue data
- `jqlResultCache`: Map of JQL -> results, never expires
- `customWidgetResults`: Map of widget -> results, never expires
- `settings`: Deep cloned on every update via `structuredClone`

The store uses `structuredClone` (or `JSON.parse(JSON.stringify())` fallback) for settings mutations, which creates full deep copies. For large nested objects, this is expensive.

The store does NOT use Zustand's `persist` middleware. Instead, multiple files access `localStorage` directly:
- `local-store.ts` for settings persistence
- `chart-data-utils.ts` for plugin registry caching
- Various components for UI state

### 4.3 Event Listener and Interval Cleanup

The codebase generally handles cleanup well:
- `addEventListener` usage in 7 files with proper `removeEventListener` in cleanup
- `setInterval` in `useKpiCalculations` properly cleared on unmount
- `AbortController` properly cleaned up with `clearTimeout`
- `storage` event listener in `chart-data-utils.ts` for cache invalidation (persistent)

### 4.4 Findings

**HIGH: Unbounded Zustand state growth (F-4.4-01)**
- `jqlResultCache` and `customWidgetResults` have no size limits or TTL
- `extractionResult.issues` retains full issue data in memory after extraction completes
- `masterDatasetInfo.issues` duplicates the same data
- Impact: Memory grows with each extraction and JQL query, never released

**HIGH: No persist middleware -- scattered localStorage access (F-4.4-02)**
- Zustand store does not use `persist` middleware
- Multiple files access localStorage directly (non-reactive)
- Can cause stale reads and out-of-sync UI state
- No migration strategy for stored data format changes

**MEDIUM: structuredClone on every settings update (F-4.4-03)**
- Deep cloning the entire settings object on every mutation
- Could be optimized with immer or selective updates

**LOW: TransformCache has no eviction policy (F-4.4-04)**
- Max 5,000 entries but never cleared
- Over long sessions, could accumulate stale entries

---

## 5. Caching Strategy

### 5.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    TanStack Query                        │
│  staleTime: Infinity, gcTime: Infinity                   │
│  (Essentially a static cache, no auto-invalidation)      │
├─────────────────────────────────────────────────────────┤
│                    Zustand Store                         │
│  jqlResultCache (Map, unlimited, no TTL)                 │
│  customWidgetResults (Map, unlimited, no TTL)            │
├─────────────────────────────────────────────────────────┤
│                   KPI Engine Layer                       │
│  PluginCache (LRU, TTL=5min, max=100 entries)            │
│  compiledFnCache (WeakMap, auto-GC)                      │
│  WeeklyIssueCache (LRU, max=5 entries, per-batch)        │
│  TransformCache (Map, max=5000 entries)                  │
├─────────────────────────────────────────────────────────┤
│                   Database Layer                         │
│  Prisma Client LRU (max=10 connections)                  │
│  localStorage (5-second timed cache for plugins)         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Strengths

The KPI engine caching architecture is well-designed:
- `buildPreprocessed()` pre-computes filter, transform, weekly, and previous period data once per `calculateAll()` call, amortizing O(n) work across all plugins
- `WeeklyIssueCache` prevents redundant weekly filtering across plugin calculations
- `compiledFnCache` uses WeakMap, allowing garbage collection of unused compiled functions
- `PluginCache` has proper TTL and LRU eviction with statistics tracking

### 5.3 Weaknesses

**HIGH: TanStack Query cache is effectively static (F-5.3-01)**
- `staleTime: Infinity` means React Query will never mark data as stale
- No background refetching or stale-while-revalidate pattern
- The 5-minute polling only works when webhooks are enabled
- After extraction, KPI data is not recalculated unless user manually triggers it

**HIGH: No cross-layer cache invalidation (F-5.3-02)**
- When new data is extracted via the ETL pipeline:
  1. Master tickets are updated in DB
  2. KPI results are recalculated and stored
  3. BUT: TanStack Query and Zustand caches are NOT invalidated
- Users see stale data until they manually refresh or the polling interval fires

**MEDIUM: jqlResultCache has no size bound (F-5.3-03)**
- Every unique JQL query creates a new cache entry that never expires
- Over time, this Map can grow significantly

**MEDIUM: No cache warming strategy (F-5.3-04)**
- On application start, all KPI calculations run from scratch
- No persisted cache across page reloads
- The 5-minute polling has to wait for the first interval to fire

---

## 6. ETL Pipeline Performance

### 6.1 Current State

| Parameter | Value |
|-----------|-------|
| CHUNK_SIZE | 100 issues |
| Extraction pagination | Sequential (do-while) |
| Jira API batch size | 50 (configurable via rateLimit) |
| Retry strategy | 3 retries, 60s timeout |
| Rate limiting | 429 aware, configurable backoff |
| DB write strategy | Chunked, batched transactions |
| Pruning | Limited to 50 most recent runs |
| KPI calculation | Runs synchronously within extract flow |

### 6.2 Extraction Flow

```
1. Build JQL query
2. Sequential pagination (fetch page -> process -> next page)
3. Prune old ETL runs (limited to 50 most recent)
4. Process issues in chunks of 100:
   a. Create ticket snapshots (createMany with fallback to $transaction)
   b. Extract and create status transitions
   c. Upsert master tickets (single $transaction per chunk)
5. Detect and remove deleted tickets
6. Run KPI calculation on all master tickets
7. Store KPI results
8. Return response with all extracted issues
```

### 6.3 Database Optimization Analysis

The ETL pipeline has several good optimization patterns:

**Good: Chunked processing (CHUNK_SIZE=100)**
- Prevents memory pressure from holding all data at once
- Allows progress logging per chunk
- Fallback strategy: `createMany` with `$transaction` fallback for driver compatibility

**Good: Batch upserts in single transaction per chunk**
- Comment in code acknowledges the issue: "Individual prisma.upsert() calls each open their own SQLite write transaction, causing lock contention and P1008 socket timeouts on large datasets"
- Batch transaction reduces lock acquisitions from O(N) to O(1) per chunk

**Good: Field accessor map (FIELD_ACCESSORS)**
- Replaces O(n) if/else chain with O(1) hashmap lookup for global filter application

**Good: Pruning limited to 50 most recent runs**
- Prevents unbounded scanning of historical ETL runs

### 6.4 Findings

**HIGH: KPI calculation blocks extraction response (F-6.4-01)**
- `calculateAll()` runs synchronously within the extract API handler
- For large datasets, KPI calculation can take significant time
- User waits for full extraction + KPI calculation before seeing results
- Should be decoupled: extraction completes first, KPI calculation happens asynchronously

**HIGH: Sequential Jira API pagination (F-6.4-02)**
- No concurrent page fetching despite Jira Cloud API supporting up to 10 concurrent requests
- Linear time scaling: 200+ seconds for 10,000 issues at 50 per page

**MEDIUM: Raw issue data returned in API response (F-6.4-03)**
- Extract API returns all issues in response body
- For 10,000 issues, payload can be 10MB+
- Issues are then stored in Zustand state (duplicate in memory)

**MEDIUM: Chunk size could be dynamically tuned (F-6.4-04)**
- CHUNK_SIZE=100 is hardcoded
- SQLite performs better with larger chunks (500-1000)
- PostgreSQL can handle even larger chunks

**LOW: Size estimation uses heuristics (F-6.4-05)**
- `sizeBytes` calculation uses heuristic constants, not actual byte measurements
- Comment acknowledges: "This is a heuristic estimate... not exact measurement"
- Acceptable for capacity planning, not for precise billing

---

## 7. Electron Performance

### 7.1 Current State

| Setting | Value |
|---------|-------|
| contextIsolation | true |
| nodeIntegration | false |
| enableRemoteModule | false |
| IPC handlers | None defined |
| Preload exposure | platform, versions only |
| Dev detection | electron-is-dev |
| Build targets | macOS (dmg, zip), Windows (nsis, portable), Linux (AppImage, deb, rpm) |

### 7.2 Analysis

The Electron configuration follows security best practices:
- Context isolation enabled
- Node integration disabled in renderer
- Remote module disabled
- Minimal preload exposure

However, from a performance perspective, the Electron setup is bare-bones:
- No hardware acceleration configuration
- No GPU sandbox tuning
- No memory limit or process management
- No crash reporting or performance tracing
- No spellcheck or subframe optimization

### 7.3 Findings

**MEDIUM: No Electron-specific optimizations (F-7.3-01)**
- No `backgroundThrottling` configuration
- No `webPreferences.backgroundThrottling` or `offscreen` rendering
- On Windows, Electron can consume significant GPU memory without limits

**MEDIUM: Full Next.js server runs inside Electron (F-7.3-02)**
- The Electron app starts a full Next.js dev/production server
- In `electron:dev` mode, both Next.js dev server and Electron run simultaneously
- Combined memory usage can be 500MB+

**LOW: No spellcheck disable for performance (F-7.3-03)**
- Chromium's spellcheck loads dictionaries (~2MB each) per BrowserWindow
- Can be disabled for non-text-editing windows

**LOW: No SharedArrayBuffer or COOP/COEP headers (F-7.3-04)**
- Required for high-performance WASM and SharedArrayBuffer features
- Not critical for current use case but limits future optimization options

---

## 8. Component Performance

### 8.1 Key Components

| Component | Lines | Memoized | Risk |
|-----------|-------|----------|------|
| KpiDashboard | 3,078 | No | Critical |
| KpiCard | 1,731 | React.memo | High |
| ExtractPanel | Unknown | React.memo | Low |
| KpiDataTable | Unknown | React.memo | Low |
| ChartCard | Nested in KpiCard | No | High |
| PluginsPanel | Unknown | No | Medium |

### 8.2 ChartCard Deep Dive (nested in KpiCard.tsx)

The ChartCard component within KpiCard handles:
- Multi-series bar charts with weekly layer detection and merging
- Line charts with drag-to-zoom via mouse event handlers
- Pie charts with custom tooltips
- Area charts (for CFD)
- PNG export via html-to-image
- Time series zoom state management

The chart rendering logic has a complexity issue: each chart type has its own rendering path with custom tooltips, and all paths compute data transformations inside the render function.

### 8.3 React Virtuoso Usage

`react-virtuoso` is used for the drill-down list view. This is a good choice for large ticket lists. However, the Virtuoso component receives computed data from the parent KpiDashboard, meaning the computation still happens even if most items aren't rendered.

### 8.4 Findings

**HIGH: ChartCard tooltip functions defined inline (F-8.4-01)**
- Custom tooltips for bar, line, pie, area charts are defined in the render path
- Creates new function references on every render
- For line charts with hover interactions, this causes frequent re-renders

**HIGH: PNG export blocks main thread (F-8.4-02)**
- `html-to-image`'s `toPng()` captures DOM synchronously
- For complex charts, this can block the main thread for hundreds of milliseconds
- No loading indicator or async handling

**MEDIUM: Drag-to-zoom state management (F-8.4-03)**
- mouseDown/mouseMove/mouseUp handlers on line/area charts
- Each mouseMove fires state updates during drag
- Could benefit from throttled updates via ref+requestAnimationFrame

**MEDIUM: hasWeeklyLayers detection runs on every data change (F-8.4-04)**
- Conditional Bar rendering checks data structure to detect weekly layers
- This detection logic runs on every render
- Could be computed once and cached

**LOW: React Virtuoso data computation (F-8.4-05)**
- Drill-down data is computed in KpiDashboard before being passed to Virtuoso
- For large datasets, computing data for all items defeats the purpose of virtualization
- Should compute item data on-demand

---

## 9. Console.log Impact

### 9.1 Distribution

19 files contain ~50+ `console.log` / `console.error` / `console.warn` calls in production code paths.

**Server-side (API routes):**

| File | Count | Impact |
|------|-------|--------|
| `app/api/jira/extract/route.ts` | 8 | High -- runs during every extraction |
| `app/api/kpi/calculate/route.ts` | 6 | High -- runs during every KPI calculation |
| `lib/kpi/engine.ts` | 3 | High -- runs for every plugin calculation |
| `lib/kpi/plugin-loader.ts` | ~4 | Medium -- runs during plugin initialization |
| `lib/kpi/plugin-watcher.ts` | ~5 | Low -- runs on file system events |
| `app/api/jira/master/[connectionId]/route.ts` | ~2 | Medium |
| `app/api/webhooks/jira/route.ts` | ~2 | Low |
| `app/api/jira/test-issue/route.ts` | ~1 | Low |

**Client-side (browser):**

| File | Count | Impact |
|------|-------|--------|
| `components/dashboard/KpiCard.tsx` | 6 | High -- renders on every widget |
| `components/dashboard/PluginsPanel.tsx` | ~3 | Medium |
| `components/dashboard/jql/JqlFilterSettings.tsx` | 3 | Medium |
| `components/dashboard/ExtractPanel.tsx` | ~3 | Medium |
| `app/page.tsx` | ~7 | Medium |

### 9.2 Findings

**HIGH: ~50+ console.log in production paths (F-9.2-01)**
- In server-side code, synchronous console.log writes in API handlers add I/O overhead per request
- In client-side code, console.log in render paths (KpiCard, PluginsPanel) executes on every render
- Impact: Minor in isolation, but cumulative effect on request throughput and render performance

---

## 10. Prioritized Optimization Recommendations

### Phase 1: Immediate (Critical Issues)

| ID | Issue | Recommendation | Impact | Risk |
|----|-------|---------------|--------|------|
| P1-01 | No code splitting | Add dynamic imports (`next/dynamic`) for route-level components, heavy chart libraries, and features not needed on initial load | Bundle size reduction: 40-60% | Low |
| P1-02 | Static TanStack Query cache | Change to `staleTime: 60000` (1 min) and implement cache invalidation after ETL extraction completes | Data freshness, user trust | Low |
| P1-03 | Monolithic KpiDashboard | Decompose into sub-components: DashboardToolbar, WidgetGrid, WidgetPanel, FilterPanel, DrillDownPanel | Render performance, maintainability | Medium |

### Phase 2: High Priority

| ID | Issue | Recommendation | Impact | Risk |
|----|-------|---------------|--------|------|
| P2-01 | KPI calc blocks extraction | Fire-and-forget KPI calculation after extraction completes; use a separate API endpoint with polling | Extraction response time: 50-80% reduction | Low |
| P2-02 | Sequential Jira pagination | Implement concurrent page fetching with configurable concurrency (max 3-5 to respect rate limits) | Extraction time: 40-60% reduction | Medium |
| P2-03 | Unbounded Zustand state | Add max size limits to `jqlResultCache` (LRU, max 50) and `customWidgetResults` (max 20); clear `extractionResult.issues` after dashboard rendering | Memory: 30-50MB reduction | Low |
| P2-04 | No cross-layer invalidation | After ETL extraction, invalidate TanStack Query cache and Zustand JQL cache; consider a `lastExtractionTimestamp` that hooks watch | Data consistency | Low |
| P2-05 | Inline tooltip functions | Extract tooltip renderers to module-level or useCallback-wrapped functions with stable dependencies | Render performance | Low |
| P2-06 | Production console.log | Replace with structured logging library (pino or similar) with level-based filtering; remove all from client components | I/O and render overhead | Low |
| P2-07 | PNG export blocks main thread | Use Web Worker or `requestIdleCallback` for html-to-image capture; add loading state | UX responsiveness | Medium |
| P2-08 | Missing tree-shaking config | Add `"sideEffects": false` to package.json; verify with bundle analyzer | Bundle size reduction: 5-15% | Low |

### Phase 3: Medium Priority

| ID | Issue | Recommendation | Impact | Risk |
|----|-------|---------------|--------|------|
| P3-01 | Vendor chunk too large | Add per-library cache groups for heavy packages (recharts, framer-motion, radix) in webpack splitChunks | Parallel loading, cache efficiency | Medium |
| P3-02 | Missing React.memo | Add React.memo to ChartCard, PluginsPanel, WidgetResizeContainer, and other pure presentational components | Render performance | Low |
| P3-03 | structuredClone overhead | Replace with Zustand `immer` middleware for immutable updates; selective state updates | Memory and CPU per mutation | Medium |
| P3-04 | No persist middleware | Migrate localStorage reads to Zustand `persist` middleware with `partialize` for selective persistence | Code quality, reactive state | Medium |
| P3-05 | filterOptions full iteration | Implement incremental filter option computation with Map-based caching; only recompute when dataset changes | Dashboard filter responsiveness | Low |
| P3-06 | CHUNK_SIZE static | Make configurable per database provider (SQLite: 500, PostgreSQL: 1000); auto-detect from storageConfig | DB write throughput | Low |
| P3-07 | No cache warming | On app start, load cached KPI results from DB if available within TTL; show stale data while recalculating | Perceived performance | Low |
| P3-08 | React Strict Mode disabled | Enable `reactStrictMode: true` for development to catch side effects; disable only in production | Development safety | Low |
| P3-09 | Client-side JQL pre-filtering | Move JQL filtering entirely to server; remove client-side regex parsing | Code simplicity, correctness | Low |
| P3-10 | Drag-to-zoom state thrashing | Use ref for intermediate zoom state; only commit to React state on mouseUp | Chart interaction smoothness | Low |
| P3-11 | Electron: no optimizations | Add `backgroundThrottling: false`, disable spellcheck, add GPU blacklist for known issues | Electron memory and responsiveness | Low |
| P3-12 | Missing image optimization | Configure `images` in next.config.ts with deviceSizes and imageSizes | Image loading performance | Low |

### Phase 4: Low Priority

| ID | Issue | Recommendation | Impact | Risk |
|----|-------|---------------|--------|------|
| P4-01 | TransformCache no eviction | Add TTL-based cleanup or LRU eviction | Memory hygiene | Low |
| P4-02 | Size estimation heuristics | Use actual JSON.stringify().length for sizeBytes in development; keep heuristics for production with sampling | Accuracy for capacity planning | Low |
| P4-03 | No request deduplication | Add TanStack Query's `queryClient.fetchQuery` with shared cache key for concurrent JQL calculations | Reduced API calls | Low |
| P4-04 | Components without useMemo | Review useMemo/useCallback in KpiDashboard inline handlers (handleUpdateChart, handleAddChart, handleRemoveChart) | Stable prop references | Low |
| P4-05 | React Virtuoso pre-computation | Compute item data lazily in Virtuoso's `itemContent` instead of pre-computing all items | Memory for large lists | Low |
| P4-06 | No SharedArrayBuffer | Add COOP/COEP headers for Electron; enables future WASM optimizations | Future-proofing | Low |
| P4-07 | hasWeeklyLayers detection | Memoize the detection result with data structure hash as key | Micro-optimization | Low |

---

## 11. Monitoring Strategy

### 11.1 Key Metrics

**Client-Side:**
- First Contentful Paint (FCP): Target < 1.5s
- Largest Contentful Paint (LCP): Target < 2.5s
- Time to Interactive (TTI): Target < 3.0s
- Total Blocking Time (TBT): Target < 200ms
- Cumulative Layout Shift (CLS): Target < 0.1
- KpiDashboard render count and duration (React Profiler)
- Zustand store update frequency and payload size
- Memory heap size trend over session lifetime

**Server-Side (API Routes):**
- `/api/jira/extract` response time: p50, p95, p99
- `/api/kpi/calculate` response time: p50, p95, p99
- KPI calculation count and duration per plugin
- Database query count and slow query detection
- Cache hit rates (PluginCache.getStats(), WeeklyIssueCache)
- Jira API call count and rate limit headroom

**Electron:**
- Process memory (main + renderer)
- GPU memory usage
- Crash rate
- Startup time (cold and warm)

### 11.2 Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Extract API p95 | > 30s | > 120s |
| KPI calculate API p95 | > 15s | > 60s |
| Client memory heap | > 300MB | > 500MB |
| Plugin cache hit rate | < 80% | < 50% |
| Jira API rate limit remaining | < 25% | < 10% |
| KpiDashboard render time | > 100ms | > 500ms |

### 11.3 Recommended Tools

- **Client performance**: Web Vitals (built into Next.js), React DevTools Profiler
- **Bundle analysis**: `ANALYZE=true next build` (already configured)
- **Server performance**: pino with structured logging and ELK/Loki aggregation
- **Database**: Prisma query logging with slow query threshold
- **Electron**: Chrome DevTools Performance tab, `--enable-logging` flag
- **Synthetic monitoring**: Lighthouse CI in CI/CD pipeline

---

## 12. Implementation Plan

### Phase 1: Code Splitting and Component Decomposition
1. Add `next/dynamic` imports for route-level components
2. Extract KpiDashboard sub-components (Toolbar, Grid, FilterPanel, DrillDown)
3. Add `sideEffects: false` to package.json
4. Run bundle analyzer to measure baseline and verify improvements

### Phase 2: Data Fetching and Caching
5. Update TanStack Query staleTime to 60s
6. Implement cache invalidation trigger after ETL extraction
7. Add size limits to Zustand caches (LRU eviction)
8. Replace console.log with structured logger

### Phase 3: ETL and Rendering Optimization
9. Decouple KPI calculation from extraction response
10. Extract tooltip renderers to stable references
11. Add React.memo to remaining presentational components
12. Migrate localStorage access to Zustand persist middleware

### Phase 4: Monitoring and Polish
13. Set up Web Vitals reporting
14. Add structured logging with level filtering
15. Configure Electron performance optimizations
16. Establish performance regression detection in CI

---

*Report generated by MoAI Performance Review -- 2026-05-28*
