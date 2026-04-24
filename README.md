# Jira ETL Dashboard for Metabase

A full-stack ETL dashboard that extracts ticket data from Jira Cloud or Server, calculates custom KPIs with **German holiday-aware business hour calculations**, and exports results to **Metabase** via CSV/JSON, PostgreSQL, or direct Metabase API push.

Built with **Next.js 16.1**, **React 19**, **Prisma ORM**, **shadcn/ui**, and **Tailwind CSS 4**.

---

## Features

### Data Extraction
- **Jira Cloud & Server** support via REST API v3 with Basic Auth
- Full **JQL** query support for flexible issue filtering
- **Changelog expansion** for complete workflow transition history
- **Quick Pull** presets: 7, 30, 90, 365 days baseline data
- **Polling / auto-refresh** with configurable intervals (5min–4hr)
- **Rate limiting** with delay, batch size, and backoff strategies (none/linear/exponential)
- Custom field mapping (Story Points, Sprint, Epic Link)

### KPI Calculation Engine
**9 built-in plugins:**

| Plugin | Category | What It Measures |
|--------|----------|-----------------|
| Avg. Processing Hours | Processing Time | Avg business hours from creation to resolution |
| Median Processing Hours | Processing Time | Median business hours to resolution |
| Time in Status | Turnaround | Avg business hours per workflow status |
| SLA Compliance Rate | SLA | % tickets resolved within SLA target |
| SLA by Priority | SLA | Per-priority SLA compliance (8h/24h/40h/80h/120h) |
| Throughput | Throughput | Tickets created and resolved per period |
| Resolution Rate | Quality | % of created tickets that are resolved |
| Avg. Working Days | Processing Time | Avg working days to resolution |
| Avg. Reassignments | Quality | Avg assignee changes per ticket |

All time-based KPIs **exclude weekends and German holidays**, with configurable work hours (default 09:00–17:00).

**Custom KPI Plugin System** — Create plugins via:
- **4-step Wizard UI** (no code required): Metric Type → Filters → Output → Save
- **Formula DSL**: `COUNT(...)`, `AVG(...)`, `SUM(...)`, `PERCENTAGE(...) OF ... WHERE ...`

### German Holiday Calendar
- All **16 federal states** supported (National, BW, BY, BE, BB, HB, HH, HE, MV, NI, NW, RP, SL, SN, ST, SH, TH)
- **18 holidays** per year including Easter-based variable dates
- Utility functions: `isWorkingDay()`, `calculateBusinessHours()`, `calculateWorkingDays()`, `getHolidaysInRange()`

### Export & Integration
Three export modes in the Export tab:

| Mode | Description |
|------|-------------|
| **File Export** | Download as CSV or Metabase-compatible JSON |
| **PostgreSQL Push** | Direct write with auto-create table + upsert |
| **Metabase Direct Push** | Upload CSV + trigger DB sync + auto-create dashboard card |

### Connection Management
Manage connections for:
- **Jira** (Cloud/Server) — with test connectivity
- **PostgreSQL** — with SSL mode, schema, and table config
- **Metabase** — with session auth or API key, database discovery

### Configuration
- **Rate limit settings** — Delay, max RPM, batch size, backoff strategy
- **General settings** — Default holiday state, work hours, SLA target
- **Save/load configuration** as JSON file (credentials excluded for safe sharing)
- **Dark/light theme** toggle with persistence

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1, React 19, TypeScript 5 |
| UI | shadcn/ui (53 components), Tailwind CSS 4, Radix UI, Lucide icons |
| Database | Prisma 6 ORM (SQLite for local, PostgreSQL for Vercel) |
| Charts | Recharts 2.15 |
| Forms | React Hook Form 7, Zod 4 |
| State | Zustand 5, TanStack Query 5 |
| Auth | NextAuth 4 (available, not configured) |
| Runtime | Node.js |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main SPA — 7-tab dashboard (~3000 lines)
│   └── api/                        # Server-side API routes
├── lib/
│   ├── jira/client.ts              # Jira REST API client
│   └── kpi/engine.ts               # KPI calculation engine
└── components/ui/                  # shadcn/ui components

scripts/                            # Maintenance & Health check scripts
├── memory-health.bat/sh            # Resource monitoring
└── test-api.bat                    # API validation

prisma/
└── schema.prisma                   # Database schema

data/                               # Local configuration storage
└── settings.json                   # App-wide preferences

db/                                 # Local SQLite database (Git ignored)
install.bat                         # Automated Windows setup
install.sh                          # Automated Linux/Mac setup
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ and npm
- A Jira Cloud or Server instance with API access

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd jira-etl-dashboard

# Run automated setup
# Windows:
install.bat

# Linux/Mac:
chmod +x install.sh
./install.sh

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### First Steps
1. **Connections tab** — Add your Jira connection (base URL, email, API token)
2. **Extract tab** — Select a connection and run extraction (try Quick Pull: "Last 7 days")
3. **KPI Dashboard** — Click "Extract & Calculate All KPIs" to see results
4. **Export tab** — Export as CSV, JSON, or push to PostgreSQL/Metabase

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | Prisma database connection string |

---

## Maintenance & Troubleshooting

For system health checks, memory issues, or port conflicts, refer to the [Scripts Documentation](scripts/README.md).

Key maintenance commands:
- `scripts\memory-health.bat` (Windows) - Check memory and clear cache
- `npm run dev:clean` - Clean cache and restart dev server
- `npm run dev:low-memory` - Run with reduced memory footprint

---

---

## API Overview

The application exposes **19 server-side API routes**:

```
GET/POST/DELETE  /api/jira/connections     # Manage Jira connections
POST             /api/jira/extract          # Run ETL extraction
GET/POST         /api/jira/poll             # Polling control
GET/POST/DELETE  /api/pg/connections       # Manage PostgreSQL connections
POST             /api/pg/export             # Push to PostgreSQL
GET              /api/pg/tables             # List PG tables
GET/POST/DELETE  /api/metabase/connections  # Manage Metabase connections
POST             /api/metabase/push         # Push to Metabase
POST             /api/metabase/export       # CSV/JSON file export
POST             /api/kpi/calculate         # Calculate KPIs
GET/POST         /api/kpi/plugins           # List/create plugins
GET              /api/holidays              # German holiday calendar
GET/POST         /api/settings              # App settings
GET/POST         /api/config                # Import/export configuration
```

---

## Database Schema

**10 models** managed by Prisma:

| Model | Purpose |
|-------|---------|
| `JiraConnection` | Jira server credentials |
| `EtlPipeline` | ETL pipeline configuration |
| `EtlRun` | Individual ETL run tracking |
| `TicketSnapshot` | Extracted ticket data |
| `TicketTransition` | Ticket status change history |
| `KpiDefinition` | KPI plugin definitions |
| `KpiResult` | Calculated KPI results |
| `PostgresConnection` | PostgreSQL target configuration |
| `MetabaseConnection` | Metabase instance credentials |
| `GermanHolidayConfig` | Cached holiday data |

---

## KPI Formula DSL

Create custom KPIs using the formula DSL in the Plugin Wizard or via API:

```
COUNT(*) WHERE status = "Done"
AVG(storyPoints) WHERE priority = "High" AND issuetype = "Story"
SUM(timeestimate) WHERE project = "PROJ"
PERCENTAGE(*) OF status = "Resolved" WHERE priority = "Critical"
```

---

## License

Private project. All rights reserved.
