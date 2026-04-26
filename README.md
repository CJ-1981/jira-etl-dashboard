# Jira ETL Dashboard for Metabase

A full-stack ETL dashboard that extracts ticket data from Jira Cloud or Server, calculates custom KPIs with **German holiday-aware business hour calculations**, and exports results to **Metabase** via CSV/JSON or PostgreSQL synchronization.

Built with **Next.js 16.1**, **React 19**, **Prisma ORM**, **shadcn/ui**, and **Tailwind CSS 4**.

---

## Features

### Data Extraction (Jira ETL)
- **Jira Cloud & Server** support via REST API v3 with Basic Auth.
- **Master Dataset Management** — Automatically tracks additions, updates, and deletions to maintain a faithful local mirror of Jira data.
- Full **JQL** query support for flexible issue filtering.
- **Changelog expansion** for complete workflow transition history.
- **Quick Pull** presets: 7, 30, 90, 365 days baseline data.
- **Polling / auto-refresh** with configurable intervals (5min–4hr).
- **Rate limiting** with delay, batch size, and backoff strategies.
- Custom field mapping (Story Points, Sprint, Epic Link).

### KPI Calculation Engine
**10 built-in plugins:**

| Plugin | Category | What It Measures |
|--------|----------|-----------------|
| Avg. Processing Hours | Processing Time | Avg business hours from creation to resolution |
| Median Processing Hours | Processing Time | Median business hours to resolution |
| Time in Status | Turnaround | Avg business hours per workflow status |
| SLA Compliance Rate | SLA | % tickets resolved within SLA target |
| SLA by Priority | SLA | Per-priority SLA compliance (8h/24h/40h/80h/120h) |
| SLA by Status | SLA | Per-status SLA compliance with comment-based clock reset |
| Throughput | Throughput | Tickets created and resolved per period |
| Resolution Rate | Quality | % of created tickets that are resolved |
| Avg. Working Days | Processing Time | Avg working days to resolution |
| Avg. Reassignments | Quality | Avg assignee changes per ticket |

All time-based KPIs **exclude weekends and German holidays**, with configurable work hours (default 09:00–17:00).

**Custom KPI Plugin System** — Create plugins via the Unified Builder:
- **Visual Builder (DSL)**: Metric Type → Filters → Output (e.g., `COUNT(*) WHERE status = "Done"`).
- **Code Editor (JavaScript)**: Write raw JavaScript functions for advanced logic.

### German Holiday Calendar
- All **16 federal states** supported.
- **18 holidays** per year including Easter-based variable dates.
- Integrated viewer and region-specific awareness for all KPI calculations.

### Export & Integration (DB Export)
Two primary export modes:

| Mode | Description |
|------|-------------|
| **File Export** | Download results as CSV or Metabase-compatible JSON. |
| **Database Sync** | Direct write to external PostgreSQL / Supabase with full schema support. |

---

## Technical Architecture

### Unified Tab Structure
The dashboard is organized into four main areas with nested sub-navigation:

1.  **ETL & Export**:
    *   **Jira ETL**: Run extractions and manage the master dataset.
    *   **DB Export**: Synchronize data to external databases or files.
2.  **KPI**:
    *   **Dashboard**: Visualize metrics and trends.
    *   **Plugins Configuration**: Manage built-in and custom plugins.
    *   **Holidays Calendar**: View and configure regional holiday settings.
3.  **Settings**:
    *   **Connections**: Manage Jira API profiles.
    *   **Storage**: Configure SQLite or PostgreSQL backends.
    *   **Configuration**: System-wide preferences (rate limits, work hours, SLA targets).
4.  **Connections Selector**: Quick-switch between Jira instances in the header.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1, React 19, TypeScript 5 |
| UI | shadcn/ui, Tailwind CSS 4, Radix UI, Lucide icons |
| Database | Prisma 6 ORM (SQLite for local, PostgreSQL for external) |
| Charts | Recharts 2.15 |
| Persistence | localStorage (Configuration) + Database (Extraction Data) |

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main SPA — Unified dashboard (~4000 lines)
│   └── api/                        # Server-side API routes
├── lib/
│   ├── jira/client.ts              # Jira REST API client
│   └── kpi/engine.ts               # KPI calculation engine
└── components/ui/                  # shadcn/ui components

prisma/
├── schema.sqlite.prisma            # Local SQLite schema
├── schema.postgresql.prisma        # External PostgreSQL schema
└── migrations/                     # Migration history
```

---

## API Overview

The application utilizes the following core API endpoints:

```
POST             /api/jira/extract          # Run ETL extraction
POST             /api/jira/poll             # Polling control
POST             /api/pg/test               # Test PostgreSQL connectivity
POST             /api/pg/export             # Push to external PostgreSQL
POST             /api/kpi/calculate         # Calculate KPIs
GET              /api/holidays              # German holiday calendar
GET/POST/DELETE  /api/jira/master/[id]      # Manage master dataset
```

---

## Database Management

### Development Workflow
This project uses **Prisma ORM** with SQLite for local development.

```bash
# Push current schema to create fresh database
npx prisma db push --schema=prisma/schema.sqlite.prisma

# Open Prisma Studio (visual database editor)
npx prisma studio --schema=prisma/schema.sqlite.prisma
```

---

## License

Private project. All rights reserved.
