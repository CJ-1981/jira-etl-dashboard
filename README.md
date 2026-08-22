# Jira ETL Dashboard for Metabase

A professional ETL dashboard that extracts ticket data from Jira Cloud or Server, calculates custom KPIs with **German holiday-aware business hour calculations**, and exports results to **Metabase** via CSV/JSON or PostgreSQL synchronization.

Built with **Next.js 16**, **React 19**, **Prisma ORM**, **shadcn/ui**, and **Tailwind CSS 4**.

## 📸 Screenshots

### Data Center
Extract ticket data from Jira with JQL queries, date range selection, scheduled polling, and export to CSV/JSON/PostgreSQL. The extraction list previews results with key, summary, assignee, and status columns — filter by multiple statuses at once, search, and sort (newest created by default).

<p align="center">
  <img src="docs/screenshots/data-center.png" alt="Data Center - Jira Extraction Panel" width="800" />
</p>

### KPI Analytics
Interactive dashboard with 32 KPI plugins, drill-down capabilities, chart visualizations, saved views, and alert thresholds.

<p align="center">
  <img src="docs/screenshots/kpi-analytics.png" alt="KPI Analytics Dashboard" width="800" />
</p>

### Settings
Manage Jira connections, storage engine configuration (SQLite/PostgreSQL), and application settings.

<p align="center">
  <img src="docs/screenshots/settings.png" alt="Settings Panel" width="800" />
</p>

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
- **Hardened Local API Surface** — Unauthenticated endpoints accept loopback-origin requests only (CSRF protection), Jira issue keys are validated before use, and ETL runs are marked complete only after a fully successful load.
- **Server-Side Calculation with Smart Caching** — KPI computation runs on the server via the calculation API, with TanStack Query handling caching, background refetching, and consistent loading states to keep the UI responsive even with tens of thousands of tickets.

---

## 🛠️ Core Capabilities

### Jira ETL & Data Extraction
- **Dynamic Storage Engines** — Store your master dataset locally in SQLite for privacy or on Supabase for team-wide accessibility via Metabase.
- **Master Dataset Management** — Automatically tracks additions, updates, and deletions to maintain a faithful local mirror of Jira data.
- **Scheduled Polling** — Robust server-side background sync (1min–4hr intervals) that survives restarts and hot-reloads; the extraction list silently refreshes when a scheduled run completes.
- **Extraction Logic** — Smart `update-only` mode that fetches only modified tickets since the last sync to minimize API load.
- **Live Extraction List** — Preview extracted issues with key, summary, assignee, and status columns; combine free-text search with multi-select status filtering and sort by key or created/updated date (newest created by default).

### KPI Calculation Engine
**32 built-in plugins** (23 core + 9 time-series) organized by business domain:

**Processing Time (6 plugins)**
- Avg Processing Hours — Average business hours from creation to resolution
- Median Processing Hours — Median business hours for better outlier resistance
- Avg Working Days — Average calendar days excluding weekends
- Cycle Time Histogram — Distribution of resolution times
- Aging WIP — Open tickets exceeding business hour thresholds
- First Response Time — Time to first assignee comment

**SLA (4 plugins)**
- SLA Compliance — % of tickets meeting per-priority targets
- SLA by Priority — Compliance breakdown by priority level
- SLA by Status — % of status durations meeting per-status targets
- SLA by Status (excl. clones) — SLA excluding cloned tickets

**Turnaround (3 plugins)**
- Time in Status — Average business hours per workflow status
- No Comment Follow-up — Open tickets with no new comment for >3 / >7 working days (status changes do not reset the clock)
- No Activity Follow-up — Open tickets with no comment and no status change for >3 / >7 working days

**Throughput (6 plugins)**
- Throughput — Count of tickets completed in period
- Open Tickets by Priority — Current backlog breakdown
- Closed Tickets by Priority — Resolved backlog breakdown
- Open Tickets by Status — Backlog breakdown by workflow status
- Open Tickets Kanban — Kanban-style view of open tickets
- Weekly Ticket List — Per-week ticket listing

**Quality (2 plugins)**
- Resolution Rate — % of tickets resolved
- Reassignment Rate — % of tickets with assignee changes

**Assignee (2 plugins)**
- Open Tickets by Assignee — Current workload distribution
- Open Tickets by Issue Owner Team — Workload distribution by owning team

**Time-Series Plugins (9 plugins)**
- Avg Processing Hours (Weekly) — Weekly processing time trend
- Throughput (Weekly) — Weekly throughput tracking
- Priority Inflow (Weekly) — Weekly new-ticket inflow split by priority (P0 → P3)
- Cumulative Flow (Daily) — Ticket status distribution over time (CFD)
- SLA Compliance (Weekly) — Weekly SLA compliance trend
- SLA by Status (Weekly) — Weekly per-status SLA trend
- SLA by Status excl. clones (Weekly) — Weekly per-status SLA trend excluding cloned tickets
- Time in Status (Daily) — Daily time-series tracking per status
- Open Tickets by Assignee (Weekly) — Weekly workload tracking

All time-based KPIs **exclude weekends and German holidays** (all 16 states supported), with configurable work hours.

### 🎯 Plugin Architecture
**File-Based Auto-Discovery System** — Plugins are stored as independent files in domain-based directories and registered automatically at server startup; a file watcher tracks the custom-plugin directory for changes.

```
src/lib/kpi/plugins/
├── builtin/              # Core plugins (23 plugins)
│   ├── processing-time/  # 6 plugins
│   ├── sla/              # 4 plugins
│   ├── turnaround/       # 3 plugins
│   ├── throughput/       # 6 plugins
│   ├── quality/          # 2 plugins
│   └── assignee/         # 2 plugins
├── time-series/          # Trend analysis plugins (9 plugins)
│   ├── processing-time/  # 1 plugin
│   ├── sla/              # 3 plugins
│   ├── turnaround/       # 1 plugin
│   ├── throughput/       # 3 plugins
│   └── assignee/         # 1 plugin
└── custom/               # Scaffolding only — runtime custom plugins load from data/custom-plugins/
```

### 🔌 Custom Plugin Support
**Extend without Code Changes** — Create custom KPI plugins either through the dashboard's Plugin Studio (stored with your local configuration) or by dropping plugin files into the `data/custom-plugins/` directory.

**Features:**
- **Auto-Discovery** — File-based plugins detected and loaded on server startup
- **File Watching** — File system watcher monitors `data/custom-plugins/` for changes
- **Domain Organization** — Group custom plugins by business domain
- **Validation** — Automatic plugin structure validation before registration
- **Error Isolation** — Custom plugin failures don't affect built-in plugins
- **Sandboxed Formulas** — Custom DSL (`COUNT`/`AVG`/`SUM`/`PERCENTAGE`) and JavaScript formulas run in a sandboxed expression interpreter — no `eval`/`new Function`, with an allow-list of safe methods only (see `custom_plugin_guide.md`)
- **UI Management** — Enable/disable plugins, create new plugins via the Plugin Studio

**Getting Started (file-based):**
1. Create a new file: `data/custom-plugins/{domain}/my-metric.ts`
2. Export a `KpiPlugin` object with `id`, `name`, `calculate` function
3. Restart the server — plugin files are loaded at startup
4. Manage via **KPI Analytics** → **Plugins Configuration** → **Custom Plugins**

**SLA Comment Rule Configuration** — Choose how SLA clock resets work for SLA by Status calculations:
- **Assignee Only** (default): Only comments from the ticket's assignee reset the SLA clock
- **Anyone**: Any comment on the ticket resets the SLA clock
Configure this in **KPI Analytics** → **Plugins Configuration** → **SLA Targets by Status**

---

## 🏗️ Technical Architecture

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| State Management | **TanStack React Query 5** (Caching & Background Sync) |
| Performance | **React Virtuoso** (Virtual Scrolling) |
| Computation | Server-side KPI engine (`/api/kpi/calculate`) with query caching |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI, Framer Motion |
| Database | **Prisma 6 (Dual-Client)** — SQLite (local) + PostgreSQL (Supabase) |
| Charts | Recharts 2.15 (Interactive Layers) |
| Exports | html-to-image (PNG), CSV/JSON |

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 20.9+ (Node 22 LTS recommended — used by CI)
- Jira API Token (for Cloud) or Password (for Server)

### Installation
```bash
npm install
npm run dev
```

> `npm install`, `npm run dev`, and `npm run build` automatically run the Prisma setup
> hook (`scripts/prisma-setup.mjs`), which generates the SQLite/PostgreSQL clients and
> pushes the schema to the local SQLite database.

### Environment variables
Copy `.env.example` to `.env` and adjust the values as needed:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Database connection string (SQLite file path or PostgreSQL URL) |
| `JIRA_WEBHOOK_SECRET` | Shared secret used to authenticate incoming Jira webhooks |
| `CUSTOM_PLUGIN_DIR` | Directory scanned for custom KPI plugins (defaults to `data/custom-plugins/`) |
| `PORT` | Port the server listens on |
| `HOSTNAME` | Hostname/IP the server binds to |

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

## 🧪 Development & Testing

```bash
npm test               # Vitest unit/integration suite
npm run test:coverage  # Coverage with enforced minimum thresholds (ratchet)
npm run e2e            # Playwright end-to-end suite (reuses a running dev server)
npm run lint           # ESLint
npm run type-check     # TypeScript strict check
```

Unit tests live in `__tests__/` directories next to the code they cover (shared mocks in `src/test/`); E2E specs live in `e2e/`. CI runs coverage, lint, and type-check on every push to `main`/`develop`.

---

## License
Private project. All rights reserved.
