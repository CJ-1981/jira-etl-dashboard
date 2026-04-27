# Jira ETL Dashboard for Metabase

A professional ETL dashboard that extracts ticket data from Jira Cloud or Server, calculates custom KPIs with **German holiday-aware business hour calculations**, and exports results to **Metabase** via CSV/JSON, PostgreSQL synchronization, or **PowerPoint reporting**.

Built with **Next.js 16.2**, **React 19**, **Prisma ORM**, **shadcn/ui**, and **Tailwind CSS 4**.

---

## 🚀 Advanced Features

### 🔍 Interactive KPI Drill-down
- **Actionable Metrics** — Click any KPI card or chart bar to instantly view the specific Jira issues comprising that metric.
- **Side-out Issue Drawer** — High-speed preview of ticket summaries, assignees, and status with direct links back to Jira.

### 📉 Smart Comparisons (Delta Analysis)
- **Automatic Benchmarking** — Every KPI automatically calculates the delta against the previous period of equal length.
- **Trend Indicators** — Visual green/red arrows and delta values provide immediate context on performance shifts (e.g., "+15 Resolved vs. last week").

### 🌓 Dynamic Global Filters
- **Live UI Slicing** — Filter the entire dashboard in real-time by **Assignee, Priority, Status, Issue Type, Component,** or **Label**.
- **Data-Driven Options** — Filter choices are dynamically extracted from your active Master Dataset.
- **Zero-Latency Updates** — KPIs and charts update instantly without requiring a new Jira sync.

### 📤 Professional Reporting
- **PPT Export** — One-click generation of professional multi-slide PowerPoint decks for stakeholder reporting.
- **Context-Aware** — Reports include executive overviews, status analysis tables, and team workload summaries, respecting all active filters.

---

## 🛠️ Core Capabilities

### Jira ETL & Data Extraction
- **Master Dataset Management** — Automatically tracks additions, updates, and deletions to maintain a faithful local mirror of Jira data.
- **Scheduled Pulling** — Robust server-side background sync (1min–4hr intervals) that survives restarts and hot-reloads.
- **JQL Management** — Save and load custom JQL queries for rapid switching between different analysis scopes.
- **Quick Pull** presets for 1, 7, 30, 90, and 365-day baseline data.
- **Rate limiting** with configurable delay, batch size, and backoff strategies.

### KPI Calculation Engine
**12+ built-in plugins:**

| Plugin | Category | What It Measures |
|--------|----------|-----------------|
| Avg. Processing Hours | Processing Time | Avg business hours from creation to resolution |
| Time in Status | Turnaround | Avg business hours per workflow status |
| SLA Compliance Rate | SLA | % tickets resolved within SLA target |
| Throughput | Throughput | Tickets created, resolved, and currently open |
| Open Tickets by Assignee | Assignee | Current workload distribution per user |
| Open Tickets Trend | Assignee | Weekly workload trends per assignee |
| Resolution Rate | Quality | % of created tickets that are resolved |

All time-based KPIs **exclude weekends and German holidays** (all 16 states supported), with configurable work hours.

**Custom KPI Plugin System**:
- **Visual Builder (DSL)**: Metric Type → Filters → Output.
- **Code Editor (JavaScript)**: Raw JS functions for complex data transformations.

### Export & Integration
- **Database Sync**: Direct write to PostgreSQL / Supabase with full schema support.
- **File Export**: Download results as CSV or Metabase-compatible JSON.
- **PowerPoint**: Multi-slide executive reports.

---

## 🏗️ Technical Architecture

### Unified Tab Structure
1.  **ETL & Export**: Manage Jira sync, scheduled pulls, and database exports.
2.  **KPI**: Interactive dashboard with global filters, drill-downs, and trend analysis.
3.  **Settings**: Configure Jira/PG connections, storage backends (SQLite/Postgres), and system preferences.

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (Webpack), React 19, TypeScript 5 |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI, Sheet (Vaul) |
| Database | Prisma 6 ORM (SQLite local, PostgreSQL external) |
| Charts | Recharts 2.15 |
| Exports | PptxGenJS (PowerPoint), CSV/JSON |

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
