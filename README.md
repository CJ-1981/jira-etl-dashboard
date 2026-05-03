# Jira ETL Dashboard for Metabase

A professional ETL dashboard that extracts ticket data from Jira Cloud or Server, calculates custom KPIs with **German holiday-aware business hour calculations**, and exports results to **Metabase** via CSV/JSON, PostgreSQL synchronization, or **PowerPoint reporting**.

Built with **Next.js 16.2**, **React 19**, **Prisma ORM**, **shadcn/ui**, and **Tailwind CSS 4**.

---

## 🚀 Advanced Features

### 🔍 Interactive KPI Drill-down & Performance
- **Actionable Metrics** — Click any KPI card or chart bar to instantly view the specific Jira issues comprising that metric.
- **Side-out Issue Drawer** — High-speed preview of ticket summaries, assignees, and status with direct links back to Jira.
- **Virtual Scrolling** — Powered by `react-virtuoso` to handle large lists (1000+ tickets) in drill-downs with zero lag.

### 📊 Professional Visualization Engine
- **New Analytics Plugins** — Added **Cumulative Flow Diagrams (CFD)**, **Cycle Time Distribution (Histogram)**, **Aging WIP Analysis**, and **First Response Time** metrics.
- **Synchronized Comparison** — Distribution charts include "This Week" and "Previous Week" comparison layers with non-zero data filtering.
- **Individual Chart Export** — Download any specific visualization as a high-quality PNG image for presentations.
- **Modern Aesthetics** — Premium dark-mode interface with glassmorphism effects and smooth transitions.

### 🌓 Professional Dashboard UX
- **Saved Views / Presets** — Save named dashboard states (Dates, JQL, Filters, Layouts) to switch between different reporting contexts instantly.
- **Interactive Metrics Table** — Toggle between a grid of cards and a high-density, sortable/filterable data table for rapid metric scanning.
- **KPI Alert Thresholds** — Set custom Warning and Critical limits for any plugin; includes animated pulse alerts and hover tooltips.
- **Keyboard Shortcuts**:
  - `R` — Recalculate Dashboard
  - `/` — Focus JQL Search
  - `1`, `2`, `3` — Quick Tab Navigation
  - `Cmd/Ctrl + P` — Export to Print/PDF

### ⚡ Architecture & Data Confidence
- **Hybrid Storage Architecture** — Dynamically switches between local SQLite and remote PostgreSQL (Supabase) at runtime based on frontend storage configuration.
- **Dual Prisma Clients** — Utilizes a specialized multi-client wrapper to support cross-engine compatibility without re-generating schemas or restarting the server.
- **TanStack React Query** — Advanced state management for automated background data synchronization, intelligent caching, and consistent loading states.
- **Scheduled Polling Resilience** — Server-side background sync persists storage configurations across sessions, ensuring data lands in the correct engine automatically.
- **Resilient Error Boundaries** — Individual widget isolation ensures that a single metric failure or calculation error never crashes the entire dashboard.
- **Web Worker Architecture** — Heavy KPI calculations are offloaded to a background thread, keeping the UI perfectly responsive even with tens of thousands of tickets.

---

## 🛠️ Core Capabilities

### Jira ETL & Data Extraction
- **Dynamic Storage Engines** — Store your master dataset locally in SQLite for privacy or on Supabase for team-wide accessibility via Metabase.
- **Master Dataset Management** — Automatically tracks additions, updates, and deletions to maintain a faithful local mirror of Jira data.
- **Scheduled Polling** — Robust server-side background sync (1min–4hr intervals) that survives restarts and hot-reloads.
- **Extraction Logic** — Smart `update-only` mode that fetches only modified tickets since the last sync to minimize API load.

### KPI Calculation Engine
**16+ built-in plugins:**

| Plugin | Category | What It Measures |
|--------|----------|-----------------|
| Cumulative Flow (CFD) | Throughput | Ticket status distribution over time |
| Cycle Time Distribution | Turnaround | Histogram of resolution times |
| Aging WIP Analysis | Efficiency | Open tickets exceeding business hour thresholds |
| Avg. Processing Hours | Processing Time | Avg business hours from creation to resolution |
| Time in Status | Turnaround | Avg business hours per workflow status |
| SLA Compliance Rate | SLA | % tickets resolved within SLA target |

All time-based KPIs **exclude weekends and German holidays** (all 16 states supported), with configurable work hours.

---

## 🏗️ Technical Architecture

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router), React 19, TypeScript 5 |
| State Management | **TanStack React Query 5** (Caching & Background Sync) |
| Performance | **React Virtuoso** (Virtual Scrolling) |
| Computation | Web Workers (Background Calculation) |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI, Framer Motion |
| Database | **Prisma 6 (Dual-Client)** — SQLite (local) + PostgreSQL (Supabase) |
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

### Database Initialization
If you are using an external PostgreSQL database (like Supabase), initialize the schema once.

**Option 1: Using a .env file (Recommended)**
1. Add `DATABASE_URL="your-postgresql-url"` to your `.env` file.
2. Run: `npm run db:push:pg`

**Option 2: Cross-platform command line**
*   **Windows (PowerShell):** `$env:DATABASE_URL="your-url"; npm run db:push:pg`
*   **Windows (cmd):** `set DATABASE_URL=your-url && npm run db:push:pg`
*   **Linux/macOS:** `DATABASE_URL="your-url" npm run db:push:pg`

### Build & Release
```bash
# Create a portable Windows release folder with database bundled
build-exe.bat
```

---

## License
Private project. All rights reserved.
