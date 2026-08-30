# Static Relay Mode (GitHub Pages + local Python relay)

The dashboard ships in **two build modes from one codebase**. Nothing about the
existing server/exe product changes — static mode is an additional build target
that swaps the Next.js backend for a small local Python relay and moves KPI
calculation into the browser.

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│ GitHub Pages (static)   │  HTTPS  │ Local Python relay (loopback)│
│ React SPA, relay mode   │ ──────► │ scripts/jira_relay.py        │
│ KPI calc in the browser │  gzip   │ POST /sync  → Jira ETL       │
│ views/config in browser │ ◄────── │ GET  /dataset ← SQLite store │
└─────────────────────────┘         └──────────────┬───────────────┘
                                                 │ Basic auth (env only)
                                                 ▼
                                          Jira Cloud REST
```

## How the mode is selected

The mode is **baked at build time** — never probed at runtime:

- `npm run build` / `build-exe.bat` → server mode (`NEXT_PUBLIC_BUILD_MODE` unset).
  Every API route, Prisma storage, polling scheduler, webhook and the file-based
  custom plugin system work exactly as before.
- `npm run build:static` → sets `NEXT_STATIC_EXPORT=1` (export config in
  `next.config.ts`) and `NEXT_PUBLIC_BUILD_MODE=static`, which selects relay
  mode in `src/lib/runtime/mode.ts`. The build temporarily relocates
  `src/app/api` because `output: 'export'` cannot contain route handlers
  (restored automatically afterwards).

All shared data operations go through the `DataSource` seam
(`src/lib/datasource/`): `ServerDataSource` wraps the original API calls,
`RelayDataSource` talks to the relay and computes KPIs client-side with the
same engine the server uses (`src/lib/kpi/client-calculator.ts`). Server-only
features are hidden in relay mode via `runtimeFeatures` flags, not deleted.

## Feature matrix

| Capability | Server mode (npm/exe) | Static mode (Pages + relay) |
|---|---|---|
| Extraction ETL (upsert / dedupe / incremental / deletion detection) | API routes + Prisma | Python relay + SQLite (same semantics) |
| KPI calculation | Server engine | Client-side engine (same plugins) |
| Formula plugins (Plugin Studio) | ✅ | ✅ (localStorage) |
| Dashboard views | Database | localStorage (config export/import works) |
| CSV/JSON export | Server route | Client-side Blob download |
| Holidays calendar | API route | Client-side (pure module) |
| File-based custom plugins + watcher | ✅ | Hidden |
| Polling scheduler / webhook receiver | ✅ | Hidden (auto-refresh happens on page reload / Sync) |
| Storage panel (SQLite/PG selection), PG/Metabase export | ✅ | Hidden |

## Running the relay

```bash
# stdlib only — no pip install needed
python scripts/jira_relay.py
```

Environment variables:

| Variable | Purpose | Default |
|---|---|---|
| `JIRA_BASE_URL` | Jira Cloud instance, e.g. `https://your-domain.atlassian.net` | — (required for sync) |
| `JIRA_EMAIL` | Account email for Basic auth | — (required for sync) |
| `JIRA_API_TOKEN` | Jira API token | — (required for sync) |
| `JIRA_RELAY_DB` | SQLite file for the master dataset | `<repo>/data/relay.db` |
| `JIRA_RELAY_PORT` | Listen port | `8765` |
| `ALLOWED_ORIGIN` | Browser origin allowed via CORS — **required for the dashboard to load data**; unset = browser access blocked | — (deny by default) |
| `DASHBOARD_URL` | URL opened in the browser on startup | `ALLOWED_ORIGIN` (+ dashboard path), else the default Pages URL |

On startup (server mode only — `--sync` never opens a browser) the relay opens
the dashboard automatically; use `--no-open` to suppress, or `DASHBOARD_URL` to
point somewhere else.

Instead of environment variables, configuration can live in a **`relay.env`**
file (KEY=VALUE, template: `scripts/relay.env.example`) — searched **next to
the script/exe first, then at the repo root**. This is the primary
configuration surface for the standalone exe. Real environment variables take
precedence over the file. On startup the relay reports which file it loaded,
notes when it runs on env vars alone, and prints a loud ERROR with the
searched paths when no `relay.env` exists and Jira credentials are unset.

### Standalone exe (no Python on the target machine)

```bat
build-relay-exe.bat          :: Windows  →  dist\jira-relay.exe
./build-relay-exe.sh         :: macOS/Linux  →  dist/jira-relay
```

PyInstaller bundles Python into a single executable (the **build** machine
needs Python 3.10+; the target machine does not). Deploying to users:

1. Copy `jira-relay.exe` and a filled-in `relay.env` (from
   `scripts/relay.env.example`) into a folder of the user's choice.
2. Double-click `jira-relay.exe` — the SQLite store is created at
   `data\relay.db` next to the exe, and the dashboard connects to
   `http://localhost:8765`.

`relay.env` holds the Jira API token, so it is gitignored — never commit a
filled-in copy.

### Code signing the exe

`build-relay-exe.bat` signs `dist\jira-relay.exe` automatically when a
certificate is configured, and skips (with a note) otherwise:

| Configure via | Use case |
|---|---|
| `JIRA_RELAY_SIGN_PFX` + `JIRA_RELAY_SIGN_PASSWORD` | cert in a `.pfx` file — self-signed, internal-CA issued, or a pre-2023 purchased cert |
| `JIRA_RELAY_SIGN_THUMBPRINT` | certificate in the Windows store (USB token / smart card certs from all CAs issued since mid-2023 live here) — the SHA-1 thumbprint from `certmgr.msc` |

Signing uses SHA-256 + an RFC 3161 timestamp, so signatures stay valid after
the certificate expires. On macOS, `build-relay-exe.sh` signs via `codesign`
when `JIRA_RELAY_SIGN_IDENTITY` is set (`"Developer ID Application: NAME
(TEAMID)"`); notarize with `xcrun notarytool` afterwards for distribution
outside your team.

**Which certificate?** Depends who runs the exe:

| Audience | Route | Cost | Effect |
|---|---|---|---|
| Your own team / company machines | **Self-signed or internal AD-CS cert** + install the issuer's public cert into *Trusted Root* + *Trusted Publishers* on team machines (manually, or via Group Policy / Intune) | free | No prompts on machines that trust the issuer; SmartScreen unaffected outside |
| Public / customers | **OV code-signing cert** (SSL.com, Sectigo, DigiCert…) — ships on a USB token since June 2023 | ~$100–400/yr | Signed publisher shown; SmartScreen reputation builds after enough downloads |
| Public / customers, want no SmartScreen ramp-up | **EV cert** (token) or **Azure Trusted Signing** | ~$300–500/yr, or Azure Trusted Signing ≈ $10/month | Immediate SmartScreen reputation |

Creating a self-signed cert for the internal route (PowerShell, admin not
required):

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
  -Subject "CN=YourCompany Jira Relay" -CertStoreLocation Cert:\CurrentUser\My
Export-Certificate -Cert $cert -FilePath yourcompany-relay.cer   # public half → team machines / GPO
$cert.Thumbprint                                                  # → JIRA_RELAY_SIGN_THUMBPRINT
```

Team members run once per machine (or you deploy `yourcompany-relay.cer` via
GPO's Trusted Root + Trusted Publishers stores):

```powershell
Import-Certificate -FilePath yourcompany-relay.cer -CertStoreLocation Cert:\CurrentUser\Root
Import-Certificate -FilePath yourcompany-relay.cer -CertStoreLocation Cert:\CurrentUser\TrustedPublisher
```

Azure Trusted Signing users: build the exe as usual, then sign with
`trusted-signing sign -e <endpoint> -a <account> -c <profile> dist\jira-relay.exe`
instead of the env vars above (it does not use signtool's store/PFX routes).
CI note: a USB-token cert cannot sign in GitHub Actions — sign on the machine
the token is plugged into, or use Azure Trusted Signing / a cloud HSM service
(SignPath, SSL.com eSigner) for unattended signing.

PowerShell example:

```powershell
$env:JIRA_BASE_URL="https://your-domain.atlassian.net"
$env:JIRA_EMAIL="you@company.com"
$env:JIRA_API_TOKEN="..."
$env:ALLOWED_ORIGIN="https://<user>.github.io"
python scripts/jira_relay.py
```

The token lives **only in the relay process** — it is never sent to the
browser or embedded in the static bundle. The relay binds to `127.0.0.1` and
answers CORS preflights with `Access-Control-Allow-Private-Network: true`
(Chrome requires this for https → localhost calls).

### Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness + whether Jira credentials are configured |
| `POST /sync` | Jira pull → SQLite upsert. Body: `{connectionRef, jql?, dateFrom?, dateTo?, daysBack?, updateOnly?, projectKeys, customFieldIds, storyPointsFieldId, issueOwnerTeamFieldId, batchSize?, delayMs?}` |
| `GET /dataset?connection=REF` | Master dataset with full rawData (gzipped when the client accepts it) |
| `DELETE /dataset?connection=REF` | Wipe a connection's dataset (used by connection removal) |

### Headless / scheduled syncs

```bash
python scripts/jira_relay.py --sync --connection main --projects "PROJ,DEV" --update-only
python scripts/jira_relay.py --sync --connection main --projects "PROJ,DEV" --days 30
```

Schedule with Task Scheduler / cron; the dashboard picks up fresh data on the
next page load or Sync click.

## Migrating an existing database

The relay's SQLite schema matches the app's Prisma `MasterTicket` table. To
carry over data from an existing install, point the relay at the old database
(or copy it first to keep the original untouched):

```powershell
$env:JIRA_RELAY_DB="C:\path\to\old\install\data\custom.db"
python scripts/jira_relay.py
```

Only `MasterTicket` rows are read; `EtlRun`/`TicketSnapshot`/`KpiResult`
tables are ignored (KPIs are computed in the browser on demand).

## Deploying to GitHub Pages

1. Push to `main` — the `deploy-pages.yml` workflow builds the static bundle
   (base path `/<repo-name>`) and publishes `./out`.
2. One-time: repo **Settings → Pages → Source: GitHub Actions**.
3. Custom domain or user site (`<user>.github.io` root)? Set
   `NEXT_PUBLIC_BASE_PATH` to `''` in the workflow.

## E2E tests for the static build

`npm run e2e:static` runs the relay-mode Playwright suite
(`playwright.static.config.ts` + `e2e/static-relay.spec.ts`): it builds the
static bundle, serves it under the base path (`scripts/serve-static.mjs`),
boots the real relay against a throwaway SQLite store, and drives the full
flow — credential-free connection form → seeded dataset over CORS →
client-side KPI calculation. CI runs it in the `e2e-static` job (the Python
relay needs Python on the runner; `actions/setup-python` provides it).

## Using the static build

1. Start the relay (see above).
2. Open the Pages URL. In **Settings → Connections**, the relay URL
   (default `http://localhost:8765`) and per-connection project keys are
   configured — no Jira credentials in the browser.
3. **Data Center → Jira Extraction → Run Jira Extraction** triggers a relay
   sync (same JQL/date-window/update-only semantics as server mode).
4. KPIs calculate in the browser over the synced dataset. A ~20MB dataset is
   served gzipped (~2–4MB on the wire).

## Caveats

- **Public URL, private data** — anyone can open the Pages URL, but without
  your local relay running there is no data and no secrets are in the bundle.
- **Relay CORS is deny-by-default** — the relay only serves responses readable
  by the origin in `ALLOWED_ORIGIN`. Never set it to `*`: that lets any website
  you visit read the dataset from your machine.
- **Browser support** — https → `http://localhost` works in Chrome/Edge
  (Private Network Access) and Firefox; Safari is untested.
- **No background sync** — data refreshes when the page loads or you click
  Sync; use the `--sync` CLI with an OS scheduler for unattended refreshes.
- **Payload size** — the full dataset (incl. changelogs for transition KPIs)
  is downloaded per page load. If this ever matters, a slimmed projection
  (status-only changelog) is a straightforward relay-side follow-up.
