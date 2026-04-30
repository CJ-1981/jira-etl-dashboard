# Jira ETL Dashboard for Metabase

A professional ETL dashboard that extracts ticket data from Jira Cloud or Server, calculates custom KPIs with **German holiday-aware business hour calculations**, and exports results to **Metabase** via CSV/JSON, PostgreSQL synchronization, or **PowerPoint reporting**.

Built with **Next.js 16.2**, **React 19**, **Prisma ORM**, **shadcn/ui**, and **Tailwind CSS 4**.

---

## 🚀 Advanced Features

### 🔍 Interactive KPI Drill-down
- **Actionable Metrics** — Click any KPI card or chart bar to instantly view the specific Jira issues comprising that metric.
- **Side-out Issue Drawer** — High-speed preview of ticket summaries, assignees, and status with direct links back to Jira.

### 📊 Professional Visualization Engine
- **Synchronized Comparison** — Distribution charts include "This Week" and "Previous Week" comparison layers with non-zero data filtering.
- **Interactive Legends** — Toggle visibility of specific dimensions or comparison series with instant UI reflow.
- **Individual Chart Export** — Download any specific visualization as a high-quality PNG image for presentations.
- **Incomplete Period Shading** — Trend charts visually distinguish "current" partial weeks/months from completed data using transparency and dashed indicators.
- **Modern Aesthetics** — Premium dark-mode interface with glassmorphism effects and smooth transitions.

### 📉 Smart Delta Analysis (Benchmarking)
- **Automatic Period Comparison** — Every KPI automatically calculates the delta against the previous period of equal length.
- **Trend Indicators** — Visual green/red arrows and delta values provide immediate context on performance shifts (e.g., "+15 Resolved vs. last week").

### 🌓 Dynamic Global Filters & JQL-Lite
- **Live UI Slicing** — Filter the entire dashboard in real-time by **Assignee, Priority, Status, Issue Type, Component,** or **Label**.
- **JQL-Lite Engine** — Power-user filtering using an advanced JQL-inspired query language with live autocomplete suggestions.
- **Floating Mini-bar** — Persistent control bar that appears when scrolling, providing one-click "Recalculate" and active filter status.
- **Zero-Latency Updates** — UI components update instantly utilizing a client-side state engine.

### ⚡ Performance & Data Confidence
- **Web Worker Architecture** — Heavy KPI calculations are offloaded to a background thread, keeping the UI perfectly responsive even with tens of thousands of tickets.
- **Master Dataset Memory Cache** — Intelligent caching of extracted ticket data avoids redundant network calls during filter and period adjustments.
- **Data Boundary Validation** — Automatic warnings when selected time periods extend beyond the range of locally extracted data.
- **Custom Period Detection** — Visual indicator (badge) when using non-standard date ranges outside of presets.

### 📤 Executive Reporting
- **PPT Export** — One-click generation of professional multi-slide PowerPoint decks for stakeholder reporting.
- **PNG Capture** — High-fidelity chart snapshots respecting active theme and visibility settings.
- **Context-Aware** — Reports include executive overviews, status analysis tables, and team workload summaries, respecting all active filters.

---

## 🛠️ Core Capabilities

### Jira ETL & Data Extraction
- **Master Dataset Management** — Automatically tracks additions, updates, and deletions to maintain a faithful local mirror of Jira data.
- **Scheduled Polling** — Robust server-side background sync (1min–4hr intervals) that survives restarts and hot-reloads.
- **Extraction Logic** — Smart `update-only` mode that fetches only modified tickets since the last sync to minimize API load.

### KPI Calculation Engine
**12+ built-in plugins:**

| Plugin | Category | What It Measures |
|--------|----------|-----------------|
| Avg. Processing Hours | Processing Time | Avg business hours from creation to resolution |
| Time in Status | Turnaround | Avg business hours per workflow status |
| SLA Compliance Rate | SLA | % tickets resolved within SLA target |
| Throughput | Throughput | Tickets created, resolved, and currently open |
| Open Tickets by Assignee | Assignee | Current workload distribution per user |
| Resolution Rate | Quality | % of created tickets that are resolved |

All time-based KPIs **exclude weekends and German holidays** (all 16 states supported), with configurable work hours.

**Unified Plugin Builder**:
- **Visual DSL Builder**: Create metrics via dropdowns (Metric Type → Scope → Filter Logic).
- **Advanced Code Editor**: Write raw JavaScript functions for bespoke data transformations and complex formulas.

### Export & Integration
- **Database Sync**: Direct write to PostgreSQL / Supabase with full schema support.
- **File Export**: Download results as CSV or Metabase-compatible JSON.
- **PowerPoint**: Multi-slide executive reports.

---

## 🏗️ Technical Architecture

### UI Stability & Performance
- **Web Worker Threading** — Off-main-thread processing for all metric transformations and grouping logic.
- **Hydration Guard** — Client-side initialization prevents "Flicker of Unstyled Content" and SSR mismatches.
- **Async Mount Protection** — All network-dependent components use mount guards to prevent state updates on unmounted fibers.
- **Standardized Layout** — CSS `scrollbar-gutter: stable` and layout-neutral tab transitions ensure zero UI shifting.

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router), React 19, TypeScript 5 |
| Computation | Web Workers (Background Calculation) |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI, Framer Motion |
| Database | Prisma 6 ORM (SQLite local, PostgreSQL external) |
| Charts | Recharts 2.15 (Interactive Layers) |
| Exports | PptxGenJS (PowerPoint), html-to-image (PNG), CSV/JSON |

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18+
- Jira API Token (for Cloud) or Password (for Server)

### Installation
```bash
npm install
npm run dev
```

### Database Management
```bash
# Update local SQLite schema
npx prisma db push --schema=prisma/schema.sqlite.prisma

# Visual database editor
npx prisma studio --schema=prisma/schema.sqlite.prisma
```

---

## License
Private project. All rights reserved.
