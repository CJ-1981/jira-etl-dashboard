#!/bin/bash

# ── Distribution layouts (read before "fixing" either one) ──────────────
# 1. Portable folder build (THIS script, and build-production.bat):
#    Output is a copyable folder. The database lives at app/db/custom.db,
#    NEXT TO the server, so all data travels with the folder
#    (local disk, share, USB stick). Do not move it to an app-data dir.
# 2. Single-executable build (build-exe.bat / build-exe.sh via caxa,
#    launched by launcher.cjs): the bundle self-extracts into a volatile
#    temp dir, so its database lives in the platform app-data directory
#    (or JIRA_ETL_DATA_DIR if set). See the header of launcher.cjs.
# Both formats scan ports 3200-3299 (3000 is reserved for `npm run dev`).
# ─────────────────────────────────────────────────────────────────────────

# Jira ETL Dashboard - macOS Production Build
echo "============================================================"
echo "  Jira ETL Dashboard - macOS Production Build"
echo "============================================================"
echo ""

# 1. Clean up
echo "[1/4] Cleaning up previous builds..."
rm -rf dist release_prod
mkdir -p dist/app
echo "      Done."

# 2. Build Application
echo "[2/4] Building Next.js application (standalone mode)..."
export NODE_ENV=production
npm run build
if [ $? -ne 0 ]; then
    echo "[ERROR] Build failed."
    exit 1
fi
echo "      Build successful."

# 3. Assemble dist/app folder
echo "[3/4] Assembling portable app folder..."

# Copy standalone server + assets
cp -R .next/standalone/. dist/app/
mkdir -p dist/app/.next/static
cp -R .next/static/. dist/app/.next/static/
cp -R public/. dist/app/public/

# Copy the database template (the launcher creates the real database
# from it on first run, so user data survives app updates)
node scripts/create-db-template.mjs
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to create database template."
    exit 1
fi
mkdir -p dist/app/db
cp db/template.db dist/app/db/template.db

echo "      App folder ready."

# 4. Create the smart launcher shell script (with port scanning)
echo "[4/4] Creating launcher with auto port scan..."

cat > dist/start.sh << 'LAUNCHER_EOF'
#!/bin/bash
# Jira ETL Dashboard - Smart Launcher (Auto Port Scan)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
DB_PATH="$SCRIPT_DIR/app/db/custom.db"
START_PORT=3200
MAX_PORT=3299

# Probe a candidate port by briefly binding it with node.
# We use node instead of lsof/nc because it is guaranteed to be present
# (this launcher needs node for server.js anyway), while lsof and nc are
# not reliably available on all macOS/Linux systems.
port_free() {
    node -e "require('net').createServer().on('error',()=>process.exit(1)).listen($1,'127.0.0.1',()=>process.exit(0))" > /dev/null 2>&1
}

# Find an available port (3200-3299, matches launcher.cjs; 3000 is npm run dev)
find_port() {
    local port=$START_PORT
    while [ $port -le $MAX_PORT ]; do
        if port_free "$port"; then
            echo $port
            return
        fi
        echo "  Port $port is occupied, trying $((port+1))..." >&2
        port=$((port + 1))
    done
    echo ""
}

echo ""
echo "  ============================================="
echo "    Jira ETL Dashboard"
echo "  ============================================="

AVAILABLE_PORT=$(find_port)

if [ -z "$AVAILABLE_PORT" ]; then
    echo "  [ERROR] No available port found in range $START_PORT-$MAX_PORT"
    exit 1
fi

echo "  Starting on port: $AVAILABLE_PORT"
echo "  URL: http://localhost:$AVAILABLE_PORT"
echo "  Database: $DB_PATH"
echo "  Press Ctrl+C to stop."
echo "  ============================================="
echo ""

export DATABASE_URL="file:$DB_PATH"
export NODE_ENV=production
export PORT=$AVAILABLE_PORT

# First run: create the database from the bundled template (never overwrite existing)
if [ ! -f "$DB_PATH" ] && [ -f "$APP_DIR/db/template.db" ]; then
    cp "$APP_DIR/db/template.db" "$DB_PATH"
    echo "  First run: created a new database from the bundled template."
fi

cd "$APP_DIR"
node server.js
LAUNCHER_EOF

chmod +x dist/start.sh

echo ""
echo "============================================================"
echo "  SUCCESS! Portable app is ready in 'dist' folder."
echo ""
echo "  To run: ./dist/start.sh"
echo "  The server will auto-pick an available port."
echo "============================================================"
