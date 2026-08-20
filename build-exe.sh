#!/bin/bash
# Build JIRA ETL Dashboard for macOS
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================="
echo " Building JIRA ETL Dashboard for macOS"
echo "============================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Install from https://nodejs.org/"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not available."
    exit 1
fi

echo "[1/5] Cleaning previous build artifacts..."
rm -rf prisma/generated dist node_modules/.cache
echo "Done."
echo ""

echo "[2/5] Installing dependencies..."
npm install
echo "Done."
echo ""

echo "[3/5] Building Next.js app..."
npm run build
echo "Done."
echo ""

echo "[4/5] Preparing standalone output..."
rm -rf ".next/standalone/.next/node_modules"
cp launcher.cjs ".next/standalone/launcher.cjs"

# Create a clean schema-only database template for first-run bootstrap
node scripts/create-db-template.mjs
mkdir -p ".next/standalone/db"
cp db/template.db ".next/standalone/db/template.db"

# Remove development databases so they are not shipped inside the bundle.
# The launcher creates a fresh database from the template on first run.
rm -f ".next/standalone/db/custom.db" ".next/standalone/prisma/db/custom.db"
echo "Done."
echo ""

echo "[5/5] Packaging executable..."
mkdir -p dist
npx caxa \
  --input ".next/standalone" \
  --output "dist/JIRA ETL Dashboard" \
  --no-dedupe \
  --no-include-node \
  -- "node" "{{caxa}}/launcher.cjs"

echo ""
echo "============================================="
echo " Build complete!"
echo " File: dist/JIRA ETL Dashboard"
echo "============================================="