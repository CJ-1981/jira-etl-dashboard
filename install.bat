@echo off
setlocal enabledelayedexpansion
title Jira ETL Dashboard - Dev Environment Setup

echo ============================================================
echo   Jira ETL Dashboard - Development Environment Setup
echo ============================================================
echo.

:: ── Check prerequisites ──────────────────────────────────────
echo [1/6] Checking prerequisites...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo         Download it from: https://nodejs.org (v18+)
    goto :fail
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not found. Node.js installation may be corrupted.
    goto :fail
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo         Node.js  !NODE_VER!  - OK
echo         npm      - OK
echo.

:: ── Create project directory structure ────────────────────────
echo [2/6] Creating project structure...

if not exist "db" mkdir "db"
if not exist "data" mkdir "data"
if not exist "prisma" mkdir "prisma"
if not exist "public" mkdir "public"
echo         Directories ready.
echo.

:: ── Create .env file ─────────────────────────────────────────
echo [3/6] Setting up environment variables...

set "ENV_FILE=.env"
if not exist "%ENV_FILE%" (
    echo DATABASE_URL=file:./db/custom.db > "%ENV_FILE%"
    echo         Created .env with default SQLite database path.
) else (
    echo         .env already exists, skipping.
)
echo.

:: ── Install dependencies ─────────────────────────────────────
echo [4/6] Installing npm dependencies...
echo         This may take a few minutes on first run...

call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed. Check your internet connection and try again.
    goto :fail
)
echo         Dependencies installed.
echo.

:: ── Setup Prisma ─────────────────────────────────────────────
echo [5/6] Setting up database with Prisma...

:: This script handles template selection (SQLite/PG), generation, and initialization
call node scripts/prisma-setup.mjs
if %errorlevel% neq 0 (
    echo [ERROR] Prisma setup failed.
    goto :fail
)
echo         Database ready.
echo.

:: ── Build project ────────────────────────────────────────────
echo [6/6] Building Next.js project...

call npx next build
if %errorlevel% neq 0 (
    echo [ERROR] Next.js build failed. Fix any errors above and re-run.
    goto :fail
)
echo         Build successful.
echo.

:: ── Done ─────────────────────────────────────────────────────
echo ============================================================
echo   Setup complete! Run the dev server with:
echo.
echo     npm run dev
echo.
echo   Then open http://localhost:3000 in your browser.
echo ============================================================
echo.
pause
goto :eof

:fail
echo.
echo ============================================================
echo   Setup failed. Please fix the errors above and re-run.
echo ============================================================
echo.
pause
exit /b 1
