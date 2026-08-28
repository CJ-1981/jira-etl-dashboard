#!/usr/bin/env bash
# ============================================================
# build-relay-exe.sh - build the standalone Jira ETL relay binary
#
# macOS/Linux counterpart of build-relay-exe.bat: packages
# scripts/jira_relay.py into dist/jira-relay with PyInstaller.
# The binary bundles Python, so end users do not need it installed.
#
# Build machine requirements: python3 3.10+ on PATH.
# ============================================================
set -euo pipefail
# This script lives in the repo root — work from there.
cd "$(dirname "$0")"

echo "[build-relay] === Building standalone Jira ETL relay ==="

if ! command -v python3 >/dev/null 2>&1; then
    echo "[build-relay] ERROR: python3 not found on PATH." >&2
    echo "[build-relay]        Install Python 3.10+ (only the BUILD machine needs it) and re-run." >&2
    exit 1
fi

VENV_PY=".venv-relay/bin/python"
if [ ! -x "$VENV_PY" ]; then
    echo "[build-relay] Creating build virtual environment .venv-relay ..."
    python3 -m venv .venv-relay
fi

if ! "$VENV_PY" -m PyInstaller --version >/dev/null 2>&1; then
    echo "[build-relay] Installing PyInstaller into .venv-relay ..."
    "$VENV_PY" -m pip install --quiet pyinstaller
fi

echo "[build-relay] Compiling dist/jira-relay ..."
"$VENV_PY" -m PyInstaller --clean --noconfirm --onefile --name jira-relay scripts/jira_relay.py

if [ ! -f "dist/jira-relay" ]; then
    echo "[build-relay] ERROR: expected dist/jira-relay not found" >&2
    exit 1
fi

# ============================================================
# Optional code signing (Gatekeeper). Skipped when no identity is
# configured. Set JIRA_RELAY_SIGN_IDENTITY to a "Developer ID
# Application: NAME (TEAMID)" certificate in the login keychain,
# then notarize separately (xcrun notarytool) for distribution
# outside your team. See docs/STATIC_RELAY_MODE.md - Code signing.
# ============================================================
if [ -n "${JIRA_RELAY_SIGN_IDENTITY:-}" ]; then
    echo "[build-relay] Signing dist/jira-relay with '$JIRA_RELAY_SIGN_IDENTITY' ..."
    codesign --force --options runtime --timestamp --sign "$JIRA_RELAY_SIGN_IDENTITY" dist/jira-relay
    codesign --verify --strict dist/jira-relay
    echo "[build-relay] Signature verified."
else
    echo "[build-relay] NOTE: JIRA_RELAY_SIGN_IDENTITY not set - skipping code signing."
fi

echo
echo "[build-relay] Done: dist/jira-relay"
echo "[build-relay] Deploy next to a relay.env file (template: scripts/relay.env.example):"
echo "[build-relay]   1. Copy jira-relay + relay.env to a folder of your choice"
echo "[build-relay]   2. Edit relay.env (Jira URL / email / API token)"
echo "[build-relay]   3. Run ./jira-relay - the dashboard connects to http://localhost:8765"
echo "[build-relay] See docs/STATIC_RELAY_MODE.md for details."
