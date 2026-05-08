@echo off
setlocal enabledelayedexpansion
title Jira ETL Dashboard - Portable Build

echo ============================================================
echo   Jira ETL Dashboard - Portable Build
echo ============================================================
echo.

:: ── Step 1: Check dependencies ────────────────────────────────
echo [1/5] Checking dependencies...

:: Check for running node processes that might lock Prisma files (excluding this script's host)
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [WARNING] Multiple 'node.exe' processes are running. 
    echo           This may cause EPERM errors during Prisma generation.
    echo           If the build fails, please close all other terminals/IDE.
    echo.
)

call npm install >nul 2>&1
echo       Done.

:: ── Step 2: Initialize database with correct schema ───────────
echo [2/5] Synchronizing database schema...

:: Build an absolute path for the source database
set "SOURCE_DB_ABS=%~dp0prisma\db\custom.db"
set "SOURCE_DB_ABS=%SOURCE_DB_ABS:\=/%"
set "DATABASE_URL=file:%SOURCE_DB_ABS%"

if not exist "prisma\db" mkdir "prisma\db"

echo       Targeting database: prisma\db\custom.db
echo       Pushing schema...

:: Run our central setup script first to ensure all schemas and clients are ready
:: This replaces the redundant manual calls and handles locks better
call node scripts/prisma-setup.mjs
if %errorlevel% neq 0 (
    echo [ERROR] Prisma setup failed.
    pause
    exit /b 1
)

:: Push schema to the 62MB database file (using the synchronized schema.prisma)
call npx prisma db push --schema prisma\schema.prisma --accept-data-loss
if %errorlevel% neq 0 (
    echo [ERROR] Prisma db push failed.
    pause
    exit /b 1
)
echo       Database schema and clients ready.


:: ── Step 3: Build (skip if standalone already exists) ─────────
if exist ".next\standalone\server.js" (
    echo [3/5] Standalone build already exists - skipping rebuild.
    echo       Delete .next\ and re-run if you need a fresh build.
) else (
    echo [3/5] Preparing production build...
    set NODE_ENV=production
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed.
        pause
        exit /b 1
    )
)

:: ── Step 4: Assemble portable release folder ─────────────────
echo [4/5] Assembling portable release folder...

if not exist "release" mkdir "release"
if not exist "release\app" mkdir "release\app"

:: Copy standalone server + node_modules
echo       Copying server files...
xcopy /s /e /y ".next\standalone" "release\app\" >nul

:: Copy static assets
echo       Copying static assets...
if not exist "release\app\.next\static" mkdir "release\app\.next\static"
xcopy /s /e /y ".next\static" "release\app\.next\static\" >nul

:: Copy public folder
if not exist "release\app\public" mkdir "release\app\public"
xcopy /s /e /y "public" "release\app\public\" >nul

:: Copy the CORRECT database (the 62MB one from prisma/db)
echo       Copying 62MB master database...
if not exist "release\app\db" mkdir "release\app\db"
del /f /q "release\app\db\custom.db" >nul 2>&1
copy /y "prisma\db\custom.db" "release\app\db\custom.db" >nul

:: ── Step 5: Bundle Node.js runtime ───────────────────────────
echo [5/5] Bundling Node.js runtime...
for /f "tokens=*" %%i in ('where node.exe') do (
    copy /y "%%i" "release\node.exe" >nul
    goto :node_bundled
)
:node_bundled
echo       Node.js bundled.

:: ── Write the launcher batch ──────────────────────────────────
echo       Creating launcher...

> "release\Start Jira Dashboard.bat" (
    echo @echo off
    echo setlocal enabledelayedexpansion
    echo title Jira ETL Dashboard
    echo :: Find Node.js (system or local)
    echo set "NODE_BIN=node"
    echo where node >nul 2>&1
    echo if %%errorlevel%% neq 0 (
    echo     if exist "%%~dp0node.exe" (
    echo         set "NODE_BIN=%%~dp0node.exe"
    echo     ) else if exist "%%~dp0bin\node.exe" (
    echo         set "NODE_BIN=%%~dp0bin\node.exe"
    echo     ) else (
    echo         echo [ERROR] Node.js is not installed and no local node.exe found.
    echo         echo Please copy 'node.exe' to "%%~dp0" or install Node.js.
    echo         pause
    echo         exit /b 1
    echo     )
    echo )
    echo.
    echo :: Move to the app folder
    echo cd /d "%%~dp0app"
    echo.
    echo :: Set absolute DATABASE_URL for the app
    echo set "DB_ABS=%%~dp0app\db\custom.db"
    echo set "DB_ABS=%%DB_ABS:\=/%%"
    echo set "DATABASE_URL=file:%%DB_ABS%%"
    echo.
    echo echo  =============================================
    echo echo    Jira ETL Dashboard
    echo echo  =============================================
    echo echo.
    echo echo  Server starting at http://localhost:3000
    echo echo  Press Ctrl+C to stop.
    echo echo.
    echo set NODE_ENV=production
    echo "!NODE_BIN!" server.js
    echo pause
)

echo.
echo ============================================================
echo   SUCCESS! Portable build ready in 'release' folder.
echo   Database: prisma\db\custom.db (62MB) and Node.js runtime have been bundled.
echo.
echo   To run:  Double-click  "release\Start Jira Dashboard.bat"
echo ============================================================
echo.
pause
