#!/usr/bin/env python3
"""
relay_e2e_fixture.py — seed a relay SQLite DB with fixture tickets for the
static-mode e2e suite.

Used by playwright.static.config.ts flows that must seed AFTER the browser
creates a connection (the dataset is keyed by the app-generated connection id):

  RELAY_E2E_CONN=<connection id> python scripts/relay_e2e_fixture.py

Env:
  RELAY_E2E_CONN  connectionRef to seed (required)
  JIRA_RELAY_DB   SQLite path (default <repo>/data/relay-e2e.db)

Idempotent: re-running upserts the same jiraKeys (unique on connection+key).
"""

import json
import os
import sys

_repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_repo_root, "scripts"))

DB = os.environ.get("JIRA_RELAY_DB") or os.path.join(_repo_root, "data", "relay-e2e.db")
CONN = os.environ.get("RELAY_E2E_CONN")
if not CONN:
    print("ERROR: RELAY_E2E_CONN is required", file=sys.stderr)
    sys.exit(1)

os.environ["JIRA_RELAY_DB"] = DB
import jira_relay as relay  # noqa: E402  (needs JIRA_RELAY_DB set first)


def issue(key, status, created, updated, resolved, sp, histories):
    return {
        "key": key,
        "fields": {
            "summary": f"Fixture {key}",
            "issuetype": {"name": "Task"},
            "priority": {"name": "Medium"},
            "status": {"name": status},
            "assignee": {"displayName": "Alice"},
            "reporter": {"displayName": "Bob"},
            "created": created,
            "updated": updated,
            "resolutiondate": resolved,
            "labels": ["fixture"],
            "components": [{"name": "core"}],
            "customfield_10002": sp,
        },
        "changelog": {"histories": histories},
    }


def hist(when, frm, to):
    return {
        "created": when,
        "author": {"displayName": "Alice"},
        "items": [{"field": "status", "fromString": frm, "toString": to}],
    }


ISSUES = [
    issue("E2E-1", "Done", "2026-06-01T09:00:00.000+0000", "2026-06-05T10:00:00.000+0000",
          "2026-06-05T10:00:00.000+0000", 3,
          [hist("2026-06-01T09:30:00.000+0000", "To Do", "In Progress"),
           hist("2026-06-04T15:00:00.000+0000", "In Progress", "Done")]),
    issue("E2E-2", "Done", "2026-06-10T09:00:00.000+0000", "2026-06-12T10:00:00.000+0000",
          "2026-06-12T10:00:00.000+0000", 5,
          [hist("2026-06-10T10:00:00.000+0000", "To Do", "In Progress"),
           hist("2026-06-12T09:00:00.000+0000", "In Progress", "Done")]),
    issue("E2E-3", "In Progress", "2026-07-01T09:00:00.000+0000", "2026-07-15T10:00:00.000+0000",
          None, 2,
          [hist("2026-07-02T09:00:00.000+0000", "To Do", "In Progress")]),
    issue("E2E-4", "To Do", "2026-08-01T09:00:00.000+0000", "2026-08-01T09:00:00.000+0000",
          None, 8, []),
    issue("E2E-5", "Done", "2026-05-20T09:00:00.000+0000", "2026-05-25T10:00:00.000+0000",
          "2026-05-25T10:00:00.000+0000", 1,
          [hist("2026-05-21T09:00:00.000+0000", "To Do", "In Progress"),
           hist("2026-05-24T09:00:00.000+0000", "In Progress", "Done")]),
]


def main():
    conn = relay.connect(DB)
    for i in ISSUES:
        row = relay.ticket_row(i, CONN, "customfield_10002", "customfield_10132")
        # The id is the table's global PRIMARY KEY — scope it to the connection
        # so re-seeding (same conn: upsert) and fresh connections (new ids) both work.
        row["id"] = f"e2e-{CONN}-{i['key']}"
        row["firstSeenAt"] = relay.now_iso()
        conn.execute(relay.UPSERT_SQL, row)
    conn.commit()
    count = conn.execute(
        "SELECT COUNT(*) FROM MasterTicket WHERE connectionRef = ?", (CONN,)).fetchone()[0]
    conn.close()
    print(json.dumps({"seeded": len(ISSUES), "connectionTotal": count, "db": DB}))


if __name__ == "__main__":
    main()
