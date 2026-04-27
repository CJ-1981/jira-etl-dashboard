#!/bin/bash
set -e
echo "============================================================"
echo "  Jira ETL Dashboard - Development Environment Setup"
echo "============================================================"
echo

# Check prerequisites
echo "[1/6] Checking prerequisites..."

if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed. Install v18+ from https://nodejs.org"
    exit 1
fi

NODE_VER=$(node -v)
echo "        Node.js  $NODE_VER  - OK"
echo "        npm      - OK"
echo

# Create directories
echo "[2/6] Creating project structure..."
mkdir -p db data prisma public
echo "        Directories ready."
echo

# Create .env
echo "[3/6] Setting up environment variables..."
if [ ! -f .env ]; then
    echo 'DATABASE_URL=file:./db/custom.db' > .env
    echo "        Created .env with default SQLite database path."
else
    echo "        .env already exists, skipping."
fi
echo

# Install dependencies
echo "[4/6] Installing npm dependencies..."
echo "        This may take a few minutes on first run..."
npm install
echo "        Dependencies installed."
echo

# Setup Prisma
echo "[5/6] Setting up database with Prisma..."
# This script handles template selection (SQLite/PG), generation, and initialization
node scripts/prisma-setup.mjs
echo "        Database ready."
echo

# Build
echo "[6/6] Building Next.js project..."
npx next build
echo "        Build successful."
echo

echo "============================================================"
echo "  Setup complete! Run the dev server with:"
echo ""
echo "    npm run dev"
echo ""
echo "  Then open http://localhost:3000 in your browser."
echo "============================================================"
