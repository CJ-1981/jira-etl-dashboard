#!/usr/bin/env python3
"""
jira_relay.py — local ETL relay for the static GitHub Pages build of
jira-etl-dashboard.

The static build has no backend. This relay, run on the user's machine, keeps
the two roles the Next.js server used to play:

  1. Jira ETL      — POST /sync pulls issues from Jira (paginated JQL search
                     with changelog) and upserts them into a local SQLite
                     master-ticket table (dedupe on connection+jiraKey,
                     incremental "updated"-window syncs, deletion detection on
                     broad syncs). Ports the logic of /api/jira/extract.
  2. Dataset API   — GET /dataset serves the persisted master dataset (full
                     rawData incl. changelog, gzipped) for client-side KPI
                     calculation. DELETE /dataset wipes a connection's data.

Credentials (email + API token) live ONLY in this process's environment —
they are never sent to the browser.

The SQLite schema matches the app's Prisma MasterTicket table, so the relay
can open an existing `prisma/db/custom.db` directly (zero-conversion
migration). Only MasterTicket is used; snapshots/KPI results are not needed
because KPI calculation runs in the browser.

Endpoints:
  GET    /health                          — liveness + Jira base URL
  POST   /sync                            — run a Jira pull + upsert
  GET    /dataset?connection=REF          — master dataset (gzip when accepted)
  DELETE /dataset?connection=REF          — delete a connection's dataset

Configuration (environment variables, or a relay.env KEY=VALUE file next to
the executable/repo root — see scripts/relay.env.example; real environment
variables take precedence over the file):
  JIRA_BASE_URL    e.g. https://your-domain.atlassian.net   (required for sync)
  JIRA_EMAIL       account email for Basic auth             (required for sync)
  JIRA_API_TOKEN   Jira API token                           (required for sync)
  JIRA_RELAY_DB    SQLite file (default: <app root>/data/relay.db)
  JIRA_RELAY_PORT  listen port (default 8765)
  ALLOWED_ORIGIN   browser origin allowed to call the relay
                   (default: * — set to your GitHub Pages URL, e.g.
                   https://user.github.io, for origin pinning)

Standalone exe: `build-relay-exe.bat` packages this script with PyInstaller
into dist/jira-relay.exe — no Python needed on the target machine. Paths
(DB, relay.env) resolve relative to the exe's own folder when frozen.

CLI:
  python scripts/jira_relay.py            — start the relay server
  python scripts/jira_relay.py --sync \
      --connection myconn --projects "PROJ,DEV" [--days 30] [--update-only]
                                          — headless sync, no server started

Stdlib only — no pip dependencies.
"""

import argparse
import base64
import contextlib
import gzip
import io
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid
import webbrowser
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# ── Configuration ────────────────────────────────────────────────────────────


def app_root() -> str:
    """
    Directory the relay runs from: the exe's folder in a PyInstaller build
    (``__file__`` points into a temp extraction dir there), otherwise the
    repo root (script lives in <repo>/scripts).
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env_file():
    """
    Optional KEY=VALUE config file (relay.env) next to the executable/repo
    root — the configuration surface for the standalone exe, where setting
    environment variables per launch is impractical. Real environment
    variables always win. Returns the loaded path, or None.
    """
    path = os.path.join(app_root(), "relay.env")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except OSError as e:
        print(f"[relay] WARNING: failed reading {path}: {e}", file=sys.stderr)
        return None
    return path


ENV_FILE = load_env_file()

JIRA_BASE_URL = (os.environ.get("JIRA_BASE_URL") or "").rstrip("/")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL") or ""
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN") or ""
PORT = int(os.environ.get("JIRA_RELAY_PORT") or os.environ.get("PORT") or "8765")
# CORS allow-list: empty (default) sends NO CORS headers, so browser pages on
# other origins cannot read relay responses. Set to your GitHub Pages URL;
# an explicit "*" allows any page to read the dataset (not recommended).
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN") or ""

# Dashboard URL opened in the browser on startup. Resolution order:
# DASHBOARD_URL env > ALLOWED_ORIGIN (with the dashboard path appended unless
# already present) > the default GitHub Pages deployment below.
DEFAULT_DASHBOARD_URL = "https://cj-1981.github.io/jira-etl-dashboard/"
DASHBOARD_URL = os.environ.get("DASHBOARD_URL") or ""

DEFAULT_DB_ENV = os.environ.get("JIRA_RELAY_DB")
if DEFAULT_DB_ENV:
    DEFAULT_DB_PATH = DEFAULT_DB_ENV
else:
    # Default: <app root>/data/relay.db (repo data dir, or next to the exe).
    DEFAULT_DB_PATH = os.path.join(app_root(), "data", "relay.db")

REQUEST_TIMEOUT = 60  # seconds per Jira request
MAX_RETRIES = 3

# Fields requested from Jira — mirrors the TS JiraClient base field list.
BASE_FIELDS = [
    "summary", "issuetype", "priority", "status", "assignee", "reporter",
    "created", "updated", "resolutiondate", "duedate",
    "labels", "components", "comment",
]


# ── SQLite store (Prisma MasterTicket-compatible) ───────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS MasterTicket (
    id              TEXT PRIMARY KEY,
    connectionRef   TEXT NOT NULL,
    jiraKey         TEXT NOT NULL,
    summary         TEXT NOT NULL,
    issueType       TEXT NOT NULL,
    priority        TEXT,
    status          TEXT NOT NULL,
    assignee        TEXT,
    reporter        TEXT,
    issueOwnerTeam  TEXT,
    created         TEXT NOT NULL,
    updated         TEXT NOT NULL,
    resolved        TEXT,
    dueDate         TEXT,
    storyPoints     REAL,
    labels          TEXT NOT NULL,
    components      TEXT,
    rawData         TEXT NOT NULL,
    firstSeenAt     TEXT NOT NULL,
    lastUpdatedAt   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS master_connection_key
    ON MasterTicket(connectionRef, jiraKey);
CREATE INDEX IF NOT EXISTS master_connection ON MasterTicket(connectionRef);
"""

DDL_EXTENSIONS = [
    # Prisma-created DBs already exist; these indexes make /dataset cheaper.
    "CREATE INDEX IF NOT EXISTS master_created ON MasterTicket(created)",
]


def connect(db_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    for ddl in DDL_EXTENSIONS:
        conn.execute(ddl)
    conn.commit()
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_dashboard_url() -> str:
    """Dashboard URL to open on startup (see DASHBOARD_URL config above)."""
    if DASHBOARD_URL:
        return DASHBOARD_URL
    if ALLOWED_ORIGIN and ALLOWED_ORIGIN != "*":
        if "jira-etl-dashboard" in ALLOWED_ORIGIN:
            return ALLOWED_ORIGIN  # already a dashboard URL — use as-is
        # Bare origin (e.g. https://user.github.io) gets the project path.
        return ALLOWED_ORIGIN.rstrip("/") + "/jira-etl-dashboard/"
    return DEFAULT_DASHBOARD_URL


# ── Jira client ──────────────────────────────────────────────────────────────

class JiraError(Exception):
    def __init__(self, message: str, status: int = 500):
        super().__init__(message)
        self.status = status


def auth_header() -> str:
    token = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
    return f"Basic {token}"


def jira_request(path: str, body: dict | None = None, method: str = "POST") -> dict:
    """One Jira REST call with retry/backoff. Raises JiraError with the upstream status."""
    url = f"{JIRA_BASE_URL}/rest/api/3{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": auth_header(),
        "Accept": "application/json",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"

    last_error = None
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            payload = e.read().decode(errors="replace")[:500]
            if e.code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt * 2)  # 2s, 4s
                continue
            raise JiraError(f"Jira {path} failed: {e.code} {e.reason} - {payload}", e.code)
        except (urllib.error.URLError, TimeoutError) as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(1)
                continue
    raise JiraError(f"Jira {path} unreachable: {last_error}", 502)


def extract_issues(jql: str, custom_field_ids=None, max_results=50, delay_ms=0) -> list:
    """Paginated POST /search/jql with changelog expansion (ports JiraClient.extractIssues)."""
    fields = list(BASE_FIELDS)
    for fid in custom_field_ids or []:
        if fid and fid not in fields:
            fields.append(fid)

    all_issues = []
    next_page_token = None
    while True:
        body = {"jql": jql, "maxResults": max_results, "fields": fields, "expand": "changelog"}
        if next_page_token:
            body["nextPageToken"] = next_page_token
        data = jira_request("/search/jql", body)
        all_issues.extend(data.get("issues", []))
        next_page_token = data.get("nextPageToken")
        if not next_page_token:
            return all_issues
        if delay_ms:
            time.sleep(delay_ms / 1000.0)


# ── JQL building (ports JiraClient.buildDefaultJql + update-only JQL) ───────

def valid_keys(project_keys: list) -> list:
    return [k.strip() for k in project_keys if k and k.strip() and k.strip() != "*"]


def project_clause(keys: list) -> str:
    vk = valid_keys(keys)
    if not vk:
        return ""
    inner = " OR ".join(f'project = "{k}"' for k in vk)
    return f"({inner})"


def next_day(date_str: str) -> str:
    d = date.fromisoformat(date_str)
    return (d + timedelta(days=1)).isoformat()


def build_default_jql(project_keys, date_from=None, date_to=None) -> str:
    clauses = []
    pc = project_clause(project_keys)
    if pc:
        clauses.append(pc)
    if date_from:
        clauses.append(f'(created >= "{date_from}" OR updated >= "{date_from}")')
    if date_to:
        to_exclusive = next_day(date_to)
        clauses.append(f'(created < "{to_exclusive}" OR updated < "{to_exclusive}")')
    where = " AND ".join(clauses)
    return f"{where} ORDER BY created DESC" if where else "ORDER BY created DESC"


def build_update_only_jql(project_keys, date_from=None, date_to=None, days_back=None) -> str:
    pc = project_clause(project_keys)
    prefix = f"{pc} AND " if pc else ""
    if days_back:
        return f"{prefix}updated > -{int(days_back)}d ORDER BY updated DESC"
    if date_from:
        date_to_str = next_day(date_to) if date_to else None
        window = f'updated >= "{date_from}"'
        if date_to_str:
            window += f' AND updated < "{date_to_str}"'
        return f"{prefix}{window} ORDER BY updated DESC"
    return build_default_jql(project_keys, date_from, date_to)


# ── Transform + upsert (ports /api/jira/extract MasterTicket handling) ──────

def coerce_story_points(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def extract_select_field_value(value):
    """Jira select-like custom fields: {value: "..."} or plain strings."""
    if isinstance(value, dict):
        return value.get("value") or value.get("name")
    if isinstance(value, str):
        return value
    return None


def ticket_row(issue: dict, connection_ref: str, sp_field: str, team_field: str) -> dict:
    fields = issue.get("fields") or {}
    raw_sp = fields.get(sp_field) if sp_field else None

    issue_owner_team = None
    if team_field and team_field in fields and fields.get(team_field) is not None:
        issue_owner_team = extract_select_field_value(fields.get(team_field)) or None

    def iso_or_none(v):
        return v if isinstance(v, str) and v else None

    created = iso_or_none(fields.get("created")) or now_iso()
    updated = iso_or_none(fields.get("updated")) or now_iso()

    return {
        "connectionRef": connection_ref,
        "jiraKey": issue.get("key", ""),
        "summary": fields.get("summary") or "No Summary",
        "issueType": (fields.get("issuetype") or {}).get("name") or "Task",
        "priority": (fields.get("priority") or {}).get("name"),
        "status": (fields.get("status") or {}).get("name") or "Unknown",
        "assignee": (fields.get("assignee") or {}).get("displayName"),
        "reporter": (fields.get("reporter") or {}).get("displayName"),
        "issueOwnerTeam": issue_owner_team,
        "created": created,
        "updated": updated,
        "resolved": iso_or_none(fields.get("resolutiondate")),
        "dueDate": iso_or_none(fields.get("duedate")),
        "storyPoints": coerce_story_points(raw_sp),
        "labels": json.dumps(fields.get("labels") or []),
        "components": json.dumps([c.get("name") for c in fields.get("components") or [] if c.get("name")]),
        "rawData": json.dumps(issue),
        "lastUpdatedAt": now_iso(),
    }


UPSERT_SQL = """
INSERT INTO MasterTicket
    (id, connectionRef, jiraKey, summary, issueType, priority, status, assignee,
     reporter, issueOwnerTeam, created, updated, resolved, dueDate, storyPoints,
     labels, components, rawData, firstSeenAt, lastUpdatedAt)
VALUES
    (:id, :connectionRef, :jiraKey, :summary, :issueType, :priority, :status, :assignee,
     :reporter, :issueOwnerTeam, :created, :updated, :resolved, :dueDate, :storyPoints,
     :labels, :components, :rawData, :firstSeenAt, :lastUpdatedAt)
ON CONFLICT(connectionRef, jiraKey) DO UPDATE SET
    summary=excluded.summary, issueType=excluded.issueType, priority=excluded.priority,
    status=excluded.status, assignee=excluded.assignee, reporter=excluded.reporter,
    issueOwnerTeam=excluded.issueOwnerTeam, updated=excluded.updated,
    resolved=excluded.resolved, dueDate=excluded.dueDate, storyPoints=excluded.storyPoints,
    labels=excluded.labels, components=excluded.components, rawData=excluded.rawData,
    lastUpdatedAt=excluded.lastUpdatedAt
"""

DATE_FIELD_OPERAND_RE = re.compile(r"\b(created|updated|resolved(date)?)\s*(>=|<=|>|<|=|BETWEEN)", re.IGNORECASE)


def run_sync(conn: sqlite3.Connection, params: dict) -> dict:
    """The /sync handler core. Returns the summary dict (route-compatible shape)."""
    connection_ref = params.get("connectionRef")
    if not connection_ref:
        raise JiraError("connectionRef is required", 400)
    if not (JIRA_BASE_URL and JIRA_EMAIL and JIRA_API_TOKEN):
        raise JiraError(
            "Relay is not configured for Jira sync — set JIRA_BASE_URL, "
            "JIRA_EMAIL and JIRA_API_TOKEN in the relay environment", 400)

    jql = params.get("jql")
    date_from = params.get("dateFrom")
    date_to = params.get("dateTo")
    days_back = params.get("daysBack")
    update_only = bool(params.get("updateOnly"))
    project_keys = params.get("projectKeys") or []
    if isinstance(project_keys, str):
        project_keys = [k for k in project_keys.split(",")]
    custom_field_ids = params.get("customFieldIds") or []
    sp_field = params.get("storyPointsFieldId") or "customfield_10002"
    team_field = params.get("issueOwnerTeamFieldId") or "customfield_10132"

    # Rolling window from daysBack (derived from "now", like the route).
    if days_back and not date_from:
        today = datetime.now(timezone.utc).date()
        date_from = (today - timedelta(days=int(days_back))).isoformat()
        if not date_to:
            date_to = today.isoformat()

    if not jql:
        if update_only:
            jql = build_update_only_jql(project_keys, date_from, date_to, days_back)
        else:
            jql = build_default_jql(project_keys, date_from, date_to)

    print(f"[relay] sync connection={connection_ref} jql={jql[:120]}{' [UPDATE ONLY]' if update_only else ''}",
          file=sys.stderr)

    issues = extract_issues(
        jql,
        custom_field_ids=custom_field_ids,
        max_results=int(params.get("batchSize") or 50),
        delay_ms=float(params.get("delayMs") or 0),
    )
    print(f"[relay] fetched {len(issues)} issues", file=sys.stderr)

    # Existing key → updated-timestamp map for added/updated/unchanged stats.
    existing = {
        row["jiraKey"]: row["updated"]
        for row in conn.execute(
            "SELECT jiraKey, updated FROM MasterTicket WHERE connectionRef = ?",
            (connection_ref,))
    }

    added = updated_c = unchanged = 0
    for issue in issues:
        row = ticket_row(issue, connection_ref, sp_field, team_field)
        prev = existing.get(row["jiraKey"])
        if prev is None:
            added += 1
        elif prev != row["updated"]:
            updated_c += 1
        else:
            unchanged += 1
        row["id"] = str(uuid.uuid4())
        row["firstSeenAt"] = now_iso()
        conn.execute(UPSERT_SQL, row)
    conn.commit()

    # Deletion detection — same conservative rules as the route:
    # broad (undated) app-generated syncs only, never in update-only mode.
    deleted = 0
    date_match = DATE_FIELD_OPERAND_RE.search(jql or "")
    broad_sync = not date_match
    if not update_only and broad_sync and not params.get("jql"):
        current_keys = {i.get("key") for i in issues}
        stale = [k for k in existing if k not in current_keys]
        if stale:
            conn.executemany(
                "DELETE FROM MasterTicket WHERE connectionRef = ? AND jiraKey = ?",
                [(connection_ref, k) for k in stale])
            conn.commit()
            deleted = len(stale)

    return {
        "totalExtracted": len(issues),
        "added": added,
        "updated": updated_c,
        "unchanged": unchanged,
        "deleted": deleted,
        "jql": jql,
        "timestamp": now_iso(),
        "effectiveDateFrom": date_from,
        "effectiveDateTo": date_to,
    }


def load_dataset(conn: sqlite3.Connection, connection_ref: str) -> dict:
    rows = conn.execute(
        "SELECT rawData, created, lastUpdatedAt FROM MasterTicket "
        "WHERE connectionRef = ? ORDER BY lastUpdatedAt DESC",
        (connection_ref,)).fetchall()

    issues = []
    created_ts = []
    for row in rows:
        try:
            issues.append(json.loads(row["rawData"]))
            if row["created"]:
                created_ts.append(row["created"])
        except json.JSONDecodeError:
            continue  # same tolerance as the server route

    oldest = min(created_ts) if created_ts else None
    newest = max(created_ts) if created_ts else None
    last_updated = rows[0]["lastUpdatedAt"] if rows else now_iso()

    return {
        "totalExtracted": len(issues),
        "issues": issues,
        "dateRange": {"from": oldest, "to": newest},
        "lastUpdated": last_updated,
    }


# ── HTTP server ──────────────────────────────────────────────────────────────

class RelayHandler(BaseHTTPRequestHandler):
    server_version = "JiraEtlRelay/1.0"
    protocol_version = "HTTP/1.1"

    # One connection per request keeps SQLite locking simple and safe; it is
    # closed after use (Windows holds the file otherwise).
    def db(self) -> contextlib.closing[sqlite3.Connection]:
        return contextlib.closing(connect(self.server.db_path))  # type: ignore[attr-defined]

    # ── CORS + Private Network Access ────────────────────────────────────────
    # The static page is served over https; Chrome requires relays on localhost
    # to acknowledge private-network preflights, and all responses need CORS
    # headers pinned to the allowed origin.
    #
    # @MX:WARN: SECURITY BOUNDARY — deny by default. With no CORS headers the
    # browser blocks every cross-origin READ of the relay's responses, so any
    # website the user visits is locked out of the dataset. Only set
    # ALLOWED_ORIGIN to origins you trust; an explicit "*" allows ANY page to
    # read the whole Jira dataset from this machine.
    def cors_headers(self) -> dict:
        if not ALLOWED_ORIGIN:
            return {}
        return {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Private-Network": "true",
            "Vary": "Origin",
        }

    def send_json(self, payload: dict, status: int = 200, extra_headers: dict | None = None):
        body = json.dumps(payload).encode()
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(body)),
            **self.cors_headers(),
            **(extra_headers or {}),
        }
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_gzip_json(self, payload: dict):
        """Dataset payloads run ~20MB raw; Jira JSON gzips ~5-10x."""
        raw = json.dumps(payload).encode()
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=6) as gz:
            gz.write(raw)
        body = buf.getvalue()
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Encoding": "gzip",
            "Content-Length": str(len(body)),
            **self.cors_headers(),
        }
        self.send_response(200)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Redact nothing (no credentials are ever logged), keep concise.
        print(f"[relay] {self.address_string()} {fmt % args}", file=sys.stderr)

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in self.cors_headers().items():
            self.send_header(k, v)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = self.path.split("?", 1)
        path = parsed[0]
        query = parsed[1] if len(parsed) > 1 else ""

        if path == "/health":
            ok = bool(JIRA_BASE_URL and JIRA_EMAIL and JIRA_API_TOKEN)
            self.send_json({
                "success": True,
                "jira": {
                    "baseUrl": JIRA_BASE_URL or None,
                    "configured": ok,
                },
                "version": self.server_version,
            })
            return

        if path == "/dataset":
            from urllib.parse import parse_qs, quote
            connection = (parse_qs(query).get("connection") or [""])[0]
            if not connection:
                self.send_json({"success": False, "error": "connection parameter is required"}, 400)
                return
            accepts_gzip = "gzip" in (self.headers.get("Accept-Encoding") or "")
            with self.db() as db:
                data = load_dataset(db, connection)
            if accepts_gzip:
                self.send_gzip_json({"success": True, "data": data})
            else:
                self.send_json({"success": True, "data": data})
            return

        self.send_json({"success": False, "error": f"Unknown path {path}"}, 404)

    def do_POST(self):
        parsed = self.path.split("?", 1)
        path = parsed[0]

        if path == "/sync":
            try:
                length = int(self.headers.get("Content-Length") or 0)
                params = json.loads(self.rfile.read(length).decode() or "{}")
                with self.db() as db:
                    summary = run_sync(db, params)
                self.send_json({"success": True, "summary": summary})
            except JiraError as e:
                self.send_json({"success": False, "error": str(e)}, e.status)
            except json.JSONDecodeError:
                self.send_json({"success": False, "error": "Invalid JSON body"}, 400)
            except Exception as e:  # pragma: no cover — defensive
                print(f"[relay] sync error: {e}", file=sys.stderr)
                self.send_json({"success": False, "error": f"Relay sync failed: {e}"}, 500)
            return

        self.send_json({"success": False, "error": f"Unknown path {path}"}, 404)

    def do_DELETE(self):
        from urllib.parse import parse_qs
        parsed = self.path.split("?", 1)
        path = parsed[0]
        query = parsed[1] if len(parsed) > 1 else ""

        if path == "/dataset":
            connection = (parse_qs(query).get("connection") or [""])[0]
            if not connection:
                self.send_json({"success": False, "error": "connection parameter is required"}, 400)
                return
            with self.db() as db:
                cur = db.execute("DELETE FROM MasterTicket WHERE connectionRef = ?", (connection,))
                db.commit()
            self.send_json({"success": True, "deleted": cur.rowcount})
            return

        self.send_json({"success": False, "error": f"Unknown path {path}"}, 404)


def main():
    parser = argparse.ArgumentParser(description="Jira ETL relay for the static dashboard build")
    parser.add_argument("--db", default=DEFAULT_DB_PATH, help=f"SQLite DB path (default {DEFAULT_DB_PATH})")
    parser.add_argument("--port", type=int, default=PORT, help=f"listen port (default {PORT})")
    parser.add_argument("--no-open", action="store_true", help="do not open the dashboard in a browser on startup")
    parser.add_argument("--sync", action="store_true", help="run one headless sync instead of serving")
    parser.add_argument("--connection", default="default", help="connectionRef for --sync")
    parser.add_argument("--projects", default="", help="comma-separated project keys for --sync")
    parser.add_argument("--jql", default=None, help="explicit JQL for --sync")
    parser.add_argument("--days", type=int, default=None, help="rolling window in days for --sync")
    parser.add_argument("--date-from", default=None, help="absolute window start (YYYY-MM-DD)")
    parser.add_argument("--date-to", default=None, help="absolute window end (YYYY-MM-DD)")
    parser.add_argument("--update-only", action="store_true", help="incremental update-only sync")
    args = parser.parse_args()

    if args.sync:
        conn = connect(args.db)
        params = {
            "connectionRef": args.connection,
            "projectKeys": args.projects.split(",") if args.projects else [],
            "jql": args.jql,
            "daysBack": args.days,
            "dateFrom": args.date_from,
            "dateTo": args.date_to,
            "updateOnly": args.update_only,
        }
        try:
            summary = run_sync(conn, params)
            print(json.dumps({"success": True, "summary": summary}, indent=2))
        except JiraError as e:
            print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
            sys.exit(1)
        return

    # Bootstrap + report.
    with contextlib.closing(connect(args.db)) as db:
        _ = db.execute("SELECT COUNT(*) FROM MasterTicket").fetchone()
    print(f"[relay] Jira ETL relay listening on http://127.0.0.1:{args.port}")
    if getattr(sys, "frozen", False):
        print(f"[relay] Standalone exe — data and relay.env live next to: {app_root()}")
    if ENV_FILE:
        print(f"[relay] Config loaded from: {ENV_FILE}")
    print(f"[relay] SQLite store: {args.db}")
    print(f"[relay] Jira: {JIRA_BASE_URL or '(not configured — /sync will fail)'}")
    print(f"[relay] Allowed origin: {ALLOWED_ORIGIN or '(none — browser pages cannot read relay responses)'}")
    if not ALLOWED_ORIGIN:
        print("[relay] NOTE: set ALLOWED_ORIGIN to your GitHub Pages URL so the dashboard can load data.", file=sys.stderr)
    elif ALLOWED_ORIGIN == "*":
        print("[relay] WARNING: ALLOWED_ORIGIN=* lets ANY website read the dataset from this machine.", file=sys.stderr)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), RelayHandler)
    server.db_path = args.db  # type: ignore[attr-defined]

    # The socket is already listening once the server object exists, so it is
    # safe to open the dashboard now, just before the serve loop blocks.
    if not args.no_open:
        url = resolve_dashboard_url()
        print(f"[relay] Opening dashboard: {url}")
        try:
            webbrowser.open(url)
        except Exception as e:  # pragma: no cover — headless machines etc.
            print(f"[relay] Could not open a browser ({e}) — open {url} manually.", file=sys.stderr)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[relay] stopped")


if __name__ == "__main__":
    main()
