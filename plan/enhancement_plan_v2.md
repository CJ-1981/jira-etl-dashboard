# 🗺️ Jira ETL Dashboard — Revised Implementation Plan

_Updated based on user feedback. Skipped: 2d (Sprint Velocity), 3c (Side-by-Side), 4c (Multi-Project), 6b (API Docs)._

---

## Phase 1 — Architecture & Foundation

> [!IMPORTANT]
> Do this first. Everything else gets faster once `page.tsx` is split.

| ID | Task | Effort | Impact |
|----|------|--------|--------|
| 1a | **Split `page.tsx`** into per-feature component files | Medium | 🔥🔥🔥 |
| 1b | Replace `any` types with proper TypeScript interfaces | Medium | 🔥🔥 |
| 1c | Migrate lifted state to **Zustand** (already installed) | Medium | 🔥🔥 |
| 5a | Add **React Error Boundaries** around each chart/card | Small | 🔥🔥 |
| 5d | Migrate `fetch()` calls to **React Query** (already installed) | Medium | 🔥🔥 |

---

## Phase 2 — New KPI Plugins & Analytics

| ID | Task | Effort | Impact |
|----|------|--------|--------|
| 2a | **Cycle Time Distribution Histogram** — bucket tickets by resolution time ranges | Small | 🔥🔥🔥 |
| 2b | **Aging WIP Analysis** — open tickets grouped by time-since-creation in business hours | Small | 🔥🔥🔥 |
| 2c | **First Response Time** — business hours from creation to first assignee comment/transition | Small | 🔥🔥 |
| 2e | **Cumulative Flow Diagram (CFD)** — stacked area chart of ticket status over time | Medium | 🔥🔥🔥 |

---

## Phase 3 — Dashboard UX

| ID | Task | Effort | Impact |
|----|------|--------|--------|
| 3a | **Dashboard Layout Presets / Saved Views** — save named configs (charts + filters + date) | Medium | 🔥🔥🔥 |
| 3b | **KPI Alert Thresholds** — in-app warning badge when KPIs breach configured limits | Small | 🔥🔥 |
| 3d | **Keyboard Shortcuts** — `R` recalculate, `1/2/3` tabs, `/` JQL focus, `Ctrl+P` print | Small | 🔥 |
| 3e | **Interactive KPI Data Table** — sortable/filterable table view using `@tanstack/react-table` | Medium | 🔥🔥 |
| 4d | **CSV/Excel KPI Export** — download calculated KPI values (not just raw issues) | Small | 🔥🔥 |

---

## Phase 4 — Data & Integration (Low Priority)

> [!NOTE]
> Implement after phases 1–3 are stable.

| ID | Task | Effort | Notes |
|----|------|--------|-------|
| 4a | **Jira Webhook** — optional on/off toggle in Settings for real-time sync instead of polling | Large | Optional switch; keep polling as fallback |
| 4b | **Scheduled PDF/PPT Reports** — auto-generate reports at configured intervals | Medium | Deferred |
| 5b | **Incremental KPI Calculation** — cache intermediates, only recalc affected plugins | Large | Deferred |
| 5c | **Virtual Scrolling** for large ticket lists | Small | Deferred |
| 6a | **Unit Tests** — Vitest for KPI engine pure functions | Medium | Deferred |

---

## 📋 Suggested Execution Order

```
Phase 1 → 1a (split files) → 5a (error bounds) → 1c (Zustand) → 5d (React Query) → 1b (types)
Phase 2 → 2a & 2b (quick wins) → 2c → 2e (CFD, largest effort)
Phase 3 → 3b (alert thresholds) → 4d (CSV export) → 3a (presets) → 3e (table) → 3d (shortcuts)
Phase 4 → when requested
```

---

## 🏁 Quick Wins to Start With

These are small-effort, high-value items that can ship immediately while phase 1 refactoring happens in the background:

1. **Cycle Time Histogram** (2a) — new built-in KPI plugin, ~100 lines
2. **Aging WIP** (2b) — new built-in KPI plugin, ~80 lines
3. **KPI Alert Thresholds** (3b) — config UI + badge on KPI card, ~150 lines
4. **CSV KPI Export** (4d) — download button, ~30 lines
5. **Error Boundaries** (5a) — one reusable component wrapper, ~50 lines

**Ready to start?** Say which phase or specific item you want first and I'll implement it.
