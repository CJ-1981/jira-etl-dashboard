#!/bin/bash

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

# Copy the database
mkdir -p dist/app/db
cp prisma/db/custom.db dist/app/db/custom.db

echo "      App folder ready."

# 4. Create the smart launcher shell script (with port scanning)
echo "[4/4] Creating launcher with auto port scan..."

cat > dist/start.sh << 'LAUNCHER_EOF'
#!/bin/bash
# Jira ETL Dashboard - Smart Launcher (Auto Port Scan)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
DB_PATH="$SCRIPT_DIR/app/db/custom.db"
START_PORT=3000
MAX_PORT=3100

# Find an available port
find_port() {
    local port=$START_PORT
    while [ $port -le $MAX_PORT ]; do
        if ! lsof -i:"$port" -sTCP:LISTEN -t > /dev/null 2>&1; then
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
echo "  Press Ctrl+C to stop."
echo "  ============================================="
echo ""

export DATABASE_URL="file:$DB_PATH"
export NODE_ENV=production
export PORT=$AVAILABLE_PORT

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
