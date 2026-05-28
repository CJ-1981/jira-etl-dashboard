# Comprehensive Code Review Report

**Project**: Jira ETL Dashboard
**Review Date**: 2026-05-28
**Reviewers**: 4 parallel specialist agents (Security, Performance, Quality, Integration QA)
**Scope**: Full codebase (~250+ source files, 25+ API routes, 30+ KPI plugins, 6 Prisma models)
**Tech Stack**: Next.js 16, React 19, TypeScript 5, Prisma 6.11.1, SQLite/PostgreSQL, Electron 42.1.0

---

## Overall Verdict: REQUIRES IMMEDIATE ACTION

| Dimension | Findings | Critical | High | Medium | Low | Verdict |
|-----------|----------|----------|------|--------|-----|---------|
| Security | 20 | 2 | 7 | 6 | 5 | **FAIL** — RCE + credential exposure |
| Performance | 30 | 3 | 8 | 12 | 7 | **WARN** — No code splitting, static cache |
| Code Quality | 41 | 5 | 14 | 14 | 8 | **WARN** — Type safety erosion, giant components |
| Integration QA | 15 | 3 | 3 | 5 | 4 | **FAIL** — Silent data loss, broken endpoint |
| **TOTAL** | **106** | **13** | **32** | **37** | **24** | **FAIL** |

---

## Critical Issues (13 — Must Fix Immediately)

### Security (2)

**S-C01: Remote Code Execution via `new Function()` in KPI Plugin Engine**
- File: `src/lib/kpi/engine.ts:592-603`
- User-supplied JavaScript code executes unsandboxed via `new Function('context', definition.formula)`. Context object contains all Jira ticket data, DB client, and config (including Jira credentials).
- **Fix**: Remove `new Function()` path entirely; use DSL-only or sandboxed Web Worker.

**S-C02: Jira API Tokens Stored in Browser localStorage in Plaintext**
- File: `src/lib/config/local-store.ts:4-6,88-94`
- Jira API tokens and PostgreSQL passwords stored as plaintext JSON in browser localStorage. Any XSS or compromised extension can read all credentials.
- **Fix**: Move credentials to encrypted server-side session. Use OS keychain for Electron.

### Performance (3)

**P-C01: No Code Splitting or Lazy Loading**
- Zero dynamic imports across the entire codebase. All 115 production dependencies load on initial page visit.
- **Fix**: Add `next/dynamic` for route-level components and heavy libraries (recharts, framer-motion, pptxgenjs).

**P-C02: Static TanStack Query Cache (staleTime: Infinity)**
- File: `src/hooks/useKpiCalculations.ts:160-172`
- `staleTime: Infinity, gcTime: Infinity` means data never refreshes automatically. Users see stale KPI data after extraction.
- **Fix**: Set `staleTime: 60000`. Implement cache invalidation after ETL extraction.

**P-C03: Monolithic KpiDashboard Component (3,078 lines)**
- File: `src/components/dashboard/KpiDashboard.tsx`
- Single component with ~10 useEffect hooks, 30+ store selectors, ~30 shadcn/ui imports, ~14 Recharts imports. Any state change triggers full tree reconciliation.
- **Fix**: Decompose into DashboardToolbar, WidgetGrid, FilterPanel, DrillDownPanel.

### Code Quality (5)

**Q-C01: `noImplicitAny: false` Despite `strict: true`**
- File: `tsconfig.json:13`
- Explicitly disables one of strict mode's key checks, allowing inferred `any` types to proliferate unseen.

**Q-C02: 100+ Instances of `: any` Throughout Codebase**
- Highest concentration: KpiCard.tsx (~40), engine-utils.ts (~20), ExtractPanel.tsx (~15), chart-data-utils.ts (~15).
- Core app store stores data as `any[]` and `any` for `context`.

**Q-C03: No Test Coverage for KPI Engine Core**
- `KpiEngine.calculateAll()`, `filterIssuesByPeriod()`, and plugin lifecycle have zero direct tests.
- Only plugin infrastructure (registry, cache, validator) and 3 specific plugins have coverage.

**Q-C04: No Test Coverage for API Routes**
- 25 API route handlers with zero integration tests. Core data pipeline is completely untested.

**Q-C05: No Test Coverage for Zustand Store**
- File: `src/store/app-store.ts` — state mutations untested, including cascading multi-state updates.

### Integration QA (3)

**I-C01: TicketSnapshot Missing `rawData` Column — Silent Data Loss**
- Files: `prisma/schema.prisma:37-59` vs `src/app/api/jira/extract/latest/[connectionId]/route.ts:42`
- `snapshot.rawData` is accessed but the column does not exist. Always returns `undefined`. All custom field data (including `issueOwnerTeam`) silently lost on latest extraction path.

**I-C02: Non-Existent `jiraConnection` Table — Broken Endpoint**
- File: `src/app/api/jira/test-issue/route.ts:18`
- `(db as any).jiraConnection.findUnique()` queries a table that doesn't exist in the Prisma schema. Endpoint is completely non-functional.

**I-C03: TicketSnapshot Missing `issueOwnerTeam` Column — Team KPIs Broken**
- Files: `prisma/schema.prisma:53` vs `src/app/api/jira/extract/latest/[connectionId]/route.ts:54`
- Team-based KPI plugins produce "Unassigned" for all tickets on the latest extraction path.

---

## High Priority Issues (32)

### Security (7)
| ID | Title | File |
|----|-------|------|
| S-H01 | Missing CSP, HSTS, and Permissions-Policy headers | `next.config.ts:101-125` |
| S-H02 | XSS via `dangerouslySetInnerHTML` in chart component | `src/components/ui/chart.tsx:82-99` |
| S-H03 | Arbitrary file write via custom KPI plugin upload API | `src/app/api/kpi/plugins/custom/route.ts:54-113` |
| S-H04 | No authentication on any API endpoint | All `src/app/api/**/route.ts` |
| S-H05 | SSRF via JiraClient with arbitrary baseUrl | `src/lib/jira/client.ts:73-78` |
| S-H06 | Config export includes plaintext credentials | `src/lib/config/local-store.ts:311-340` |
| S-H07 | PostgreSQL passwords transmitted in plaintext POST body | `src/app/api/pg/test/route.ts:79-98` |

### Performance (8)
| ID | Title | File |
|----|-------|------|
| P-H01 | KPI calculation blocks extraction response | `src/app/api/jira/extract/route.ts` |
| P-H02 | Sequential Jira API pagination (no concurrency) | `src/lib/jira/client.ts` |
| P-H03 | Unbounded Zustand state growth | `src/store/app-store.ts` |
| P-H04 | No cross-layer cache invalidation | TanStack Query + Zustand + ETL |
| P-H05 | Inline tooltip functions create new refs every render | `src/components/dashboard/KpiCard.tsx` |
| P-H06 | ~50+ console.log in production paths | 19 files |
| P-H07 | PNG export blocks main thread | `src/components/dashboard/KpiCard.tsx` |
| P-H08 | Missing tree-shaking configuration | `package.json` |

### Code Quality (14)
| ID | Title | File |
|----|-------|------|
| Q-H01 | 50+ `as any` unsafe type assertions | Multiple files |
| Q-H02 | `@ts-ignore` on Prisma generated client imports | `src/lib/db.ts:4-7` |
| Q-H03 | KpiCard.tsx at 1,731 lines | `src/components/dashboard/KpiCard.tsx` |
| Q-H04 | ExtractPanel.tsx at 1,217 lines | `src/components/dashboard/ExtractPanel.tsx` |
| Q-H05 | 15 `as any` casts in `transformIssueForKpi` | `src/lib/kpi/engine-utils.ts:88-106` |
| Q-H06 | No coverage thresholds in vitest.config | `vitest.config.ts` |
| Q-H07-Q14 | (See quality report for full list of 14 High issues) | Various |

### Integration QA (3)
| ID | Title | File |
|----|-------|------|
| I-H01 | API response format inconsistency in export route | `src/app/api/export/file/route.ts` |
| I-H02 | Webhook route uses default database only | `src/app/api/webhooks/jira/route.ts` |
| I-H03 | Webhook error response format inconsistency | `src/app/api/webhooks/jira/route.ts` |

---

## OWASP Top 10 Compliance

| OWASP Category | Status | Key Issue |
|----------------|--------|-----------|
| A01: Broken Access Control | **FAIL** | No authentication on any API endpoint |
| A02: Cryptographic Failures | **FAIL** | Credentials in plaintext localStorage, no HSTS |
| A03: Injection | **FAIL** | `new Function()` code injection, `dangerouslySetInnerHTML` |
| A04: Insecure Design | **FAIL** | Plugin system trusts user-supplied code |
| A05: Security Misconfiguration | **FAIL** | Missing CSP/HSTS/Permissions-Policy, stack traces in errors |
| A06: Vulnerable Components | **WARN** | Unverified third-party SDK (`z-ai-web-dev-sdk`) |
| A07: Identity & Auth Failures | **FAIL** | `next-auth` declared but not implemented |
| A08: Software & Data Integrity | **PASS** | Webhook secret uses `timingSafeEqual` |
| A09: Security Logging Failures | **WARN** | Health endpoint exposes logs; no audit log |
| A10: SSRF | **FAIL** | JiraClient has no SSRF protection (db.ts does) |

---

## TRUST 5 Assessment

| Pillar | Score | Key Issue |
|--------|-------|-----------|
| Tested | 2/5 | Zero coverage on ETL pipeline, KPI engine core, API routes, Zustand store |
| Readable | 3/5 | Giant components (3,078-line KpiDashboard), extensive `any` usage |
| Unified | 4/5 | Consistent directory structure, import patterns, API response format |
| Secured | 3/5 | Good Zod validation + rate limiting infrastructure, but RCE + credential exposure |
| Trackable | 4/5 | Conventional commits, MX tags, no TODO/FIXME in code |

---

## Key Cross-Cutting Themes

### 1. Type Safety Erosion
The combination of `noImplicitAny: false`, 100+ `: any` annotations, 50+ `as any` casts, and `@ts-ignore` on Prisma imports creates systemic type unsafety. This cascades into the Integration QA findings where non-existent DB columns are accessed via `(db as any)` without compile-time errors.

### 2. Credential Management Crisis
Jira API tokens and PostgreSQL passwords flow through the system in plaintext: localStorage storage → POST body transmission → config export JSON → Electron renderer process. This requires a fundamental architectural change to server-side encrypted session storage.

### 3. Monolithic Frontend
KpiDashboard (3,078 lines), KpiCard (1,731 lines), and ExtractPanel (1,217 lines) each handle 5+ concerns. Combined with zero code splitting, the entire application bundle loads on first visit with no lazy loading.

### 4. Test Desert for Critical Paths
The most critical code paths — ETL pipeline, KPI engine core, all API routes, Zustand store — have zero test coverage. The 17 existing test files cover plugin infrastructure and custom hooks, leaving the data pipeline completely untested.

### 5. Data Integrity Bugs
Three critical Integration QA findings reveal that the `TicketSnapshot` model is missing columns (`rawData`, `issueOwnerTeam`) that code actively tries to read. This causes silent data loss on the latest extraction path.

---

## Prioritized Fix Plan

### Phase 1: Critical Security + Data Integrity (Fix Now)

| # | Action | Type | Effort |
|---|--------|------|--------|
| 1 | Remove `new Function()` from KPI engine — use DSL-only or sandbox | Security | High |
| 2 | Move credentials from localStorage to encrypted server-side session | Security | High |
| 3 | Add `rawData` and `issueOwnerTeam` columns to TicketSnapshot model | Integration | Low |
| 4 | Fix `/api/jira/test-issue` — remove non-existent table reference | Integration | Low |
| 5 | Add CSP, HSTS, Permissions-Policy headers | Security | Low |

### Phase 2: Architecture + Type Safety (Fix Soon)

| # | Action | Type | Effort |
|---|--------|------|--------|
| 6 | Enable `noImplicitAny: true` and fix compile errors | Quality | Medium |
| 7 | Implement `next-auth` authentication + middleware | Security | High |
| 8 | Add SSRF validation to JiraClient | Security | Medium |
| 9 | Add code splitting with `next/dynamic` | Performance | Medium |
| 10 | Fix TanStack Query cache: `staleTime: 60000` + invalidation | Performance | Low |
| 11 | Decompose KpiDashboard into sub-components | Quality | High |
| 12 | Add test coverage for KPI engine core | Quality | Medium |

### Phase 3: Performance + Quality Polish (Fix Next)

| # | Action | Type | Effort |
|---|--------|------|--------|
| 13 | Decouple KPI calculation from extraction response | Performance | Medium |
| 14 | Concurrent Jira API pagination | Performance | Medium |
| 15 | Add Zustand state size limits + LRU eviction | Performance | Low |
| 16 | Standardize all error responses to `{ success, error }` format | Integration | Medium |
| 17 | Fix Prisma `@ts-ignore` — create typed DB facade | Quality | Medium |
| 18 | Add API route integration tests | Quality | High |
| 19 | Migrate localStorage access to Zustand persist middleware | Quality | Medium |
| 20 | Replace console.log with structured Logger | Quality | Low |

### Phase 4: Monitoring + Long-Term

| # | Action | Type | Effort |
|---|--------|------|--------|
| 21 | Add coverage thresholds (start 60%, target 80%) | Quality | Low |
| 22 | Set up Web Vitals reporting | Performance | Low |
| 23 | Add structured logging with pino | Performance | Low |
| 24 | Electron desktop integration + OS keychain | Security + Integration | High |
| 25 | Type clean-up: replace `any` with proper types across codebase | Quality | High |

---

## Strengths Worth Preserving

1. **KPI Plugin Architecture**: Registry, validation, dependency resolution, and caching infrastructure is well-designed with clean abstractions.
2. **Error Handling Infrastructure**: `ApiError` hierarchy, `handleApiError()`, rate limiting, and Zod validation helpers are comprehensive.
3. **MX Tag Convention**: Organic adoption of `@MX:NOTE`, `@MX:ANCHOR`, `@MX:WARN` in key files provides valuable architectural context.
4. **Database SSRF Protection**: `db.ts` has thorough host validation (private IP blocking) — just needs to be replicated in `JiraClient`.
5. **ETL Chunking**: Chunked processing (CHUNK_SIZE=100) with transaction fallback prevents memory pressure.
6. **No TODO/FIXME Debt**: Work is tracked through git, not code comments.
7. **Consistent API Patterns**: Named exports, `@/` aliases, Tailwind CSS only, consistent response formats (mostly).

---

## Review Agent Execution Details

| Agent | subagent_type | Findings | Output File | Status |
|-------|--------------|----------|-------------|--------|
| security-reviewer | expert-security | 20 | `_workspace/02_security_review.md` | Complete |
| performance-reviewer | expert-performance | 30 | `_workspace/02_performance_review.md` | Complete |
| code-quality-reviewer | manager-quality | 41 | `_workspace/02_quality_review.md` | Complete |
| integration-qa | evaluator-active | 15 | `_workspace/02_integration_review.md` | Complete |

---

*Report generated by MoAI Code Review Orchestrator — 2026-05-28*
*All 4 specialist agents ran in parallel (fan-out/fan-in pattern)*
*Full detailed reports: `_workspace/02_security_review.md`, `_workspace/02_performance_review.md`, `_workspace/02_quality_review.md`, `_workspace/02_integration_review.md`*