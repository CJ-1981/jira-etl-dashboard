# Internal Network Hosting (server mode) — future adaptation guide

**Status: not implemented.** The npm/exe server product is loopback-only by
design. This document captures what a future internal-network hosting
adaptation requires, so the work can be picked up without re-analysis. No code
changes have been made for this — everything below describes the current
behavior and the planned change.

## Why it does not work as-is

Two deliberate restrictions block teammates from reaching a hosted instance:

1. **Loopback-origin guard (CSRF protection)** — every mutating API route
   calls `isLoopbackOriginRequest()` (`src/lib/security.ts`), which rejects any
   request whose `Origin`/`Referer` host is not `localhost` / `127.0.0.1` /
   `::1`. A teammate browsing `http://yourserver:3200` sends
   `Origin: http://yourserver:3200`, so every write (extraction, saving views,
   plugin CRUD) fails with **401 "Cross-origin request rejected"**. Requests
   with no Origin header (curl, server-to-server) already pass.
2. **Launcher binds loopback** — `launcher.cjs` defaults `HOSTNAME` to
   `127.0.0.1` ("the app has no auth — keep it loopback-only"). The port is
   simply not reachable from other machines.

Both are security boundaries, not oversights: the app is **unauthenticated**
and the custom-plugin API **writes files to the host disk**. Any adaptation
must keep that risk profile in mind.

## The planned change (when needed)

### 1. Origin allowlist in `src/lib/security.ts` (~20 lines + tests)

Loopback stays always-allowed; an env var adds explicit origins:

```
ALLOWED_ORIGINS=http://yourserver:3200,http://192.168.1.50:3200
```

```ts
// sketch — do not treat as final
const extraOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function isLoopbackOriginRequest(request: Request): boolean {
  // ... existing parsing ...
  if (isLoopback(host)) return true;
  return extraOrigins.includes(origin.toLowerCase());
}
```

Match full origins (scheme + host + port), not just hostnames — the port is
part of the browser's Origin. Fail closed on unparseable headers, as today.
Add unit tests for: allowed origin accepted, other origin rejected, loopback
still accepted with the env unset and set, empty env behaves exactly like
today.

### 2. Bind to the network interface (config, no code change)

The launcher already honors `HOSTNAME`:

```powershell
$env:HOSTNAME = "0.0.0.0"          # or the machine's LAN IP
& ".\JIRA ETL Dashboard.exe"
```

Prefer the specific LAN IP over `0.0.0.0` so the port is not also exposed on
other interfaces.

### 3. Windows Firewall

Inbound rule for the chosen port. The launcher scans **3200–3299** for a free
port, so either pin the port (`PORT` env) or open the range. **Scope the rule
to the team subnet** — with no authentication, firewall scoping is the primary
access control (see risk notes below).

### 4. Optional but recommended: shared token

Because the app is unauthenticated, network exposure means anyone who can
reach the port can read all data, trigger Jira extractions, and upload plugin
files to the host. A minimal mitigation is a shared-secret check in the same
guard (e.g. `RELAY_SHARED_TOKEN` style `Authorization: Bearer` header), but
that requires a browser-side token field + header injection through the app's
fetch layer — noticeably more work than steps 1–3. At minimum, keep the
firewall scoped to the team VLAN.

## Runbook (once implemented)

1. Host machine: install the exe (or `npm run build` + `start`), create the
   data dir as usual.
2. `relay.env`-equivalent for the server: `.env` with
   `ALLOWED_ORIGINS=http://yourserver:3200`, launch with `HOSTNAME=<LAN IP>`
   and optionally `PORT=3200`.
3. Firewall rule scoped to the team subnet.
4. Teammates browse `http://yourserver:3200`; connections/storage are
   configured per browser (localStorage) as usual; the dataset, saved views,
   and ETL history live in the host's SQLite (or configured PostgreSQL).

## Alternative considered: relay static mode on the network

The static/relay mode (see [STATIC_RELAY_MODE.md](STATIC_RELAY_MODE.md)) can
also be hosted internally — the relay would bind the LAN interface and serve
the static bundle itself, making everything same-origin (no CORS, no mixed
content, no origin guard involved). That path needs relay-side changes
(`JIRA_RELAY_HOST`, `JIRA_STATIC_DIR`, shared-dataset mode) but **no changes
to the server product**, and its attack surface is smaller (4 read/sync
endpoints, no file-write APIs, Jira credentials never leave the host).
Decision record: we chose to adapt the npm server instead, because the team
wants the server-mode features (shared DB-backed dashboard views, scheduled
polling, PG/Metabase export). Revisit if those features turn out unused.
