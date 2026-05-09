@echo off
setlocal enabledelayedexpansion
title Jira ETL Dashboard - Production Build

echo ============================================================
echo   Jira ETL Dashboard - Production Build
echo ============================================================
echo.

:: ── Step 1: Clean and Prepare ─────────────────────────────────
echo [1/4] Cleaning up previous builds...
if exist "dist" rd /s /q "dist" >nul 2>&1
mkdir "dist\app"
echo       Done.

:: ── Step 2: Build Application ─────────────────────────────────
echo [2/4] Building Next.js application (standalone mode)...
set NODE_ENV=production
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo       Build successful.

:: ── Step 3: Assemble dist\app folder ──────────────────────────
echo [3/4] Assembling portable app folder...

:: Copy standalone server + static assets
xcopy /s /e /y ".next\standalone" "dist\app\" >nul
if not exist "dist\app\.next\static" mkdir "dist\app\.next\static"
xcopy /s /e /y ".next\static" "dist\app\.next\static\" >nul
xcopy /s /e /y "public" "dist\app\public\" >nul

:: Copy the database
if not exist "dist\app\db" mkdir "dist\app\db"
copy /y "prisma\db\custom.db" "dist\app\db\custom.db" >nul

:: Remove dev/build files that leaked into standalone
del /f /q "dist\app\*.md" >nul 2>&1
del /f /q "dist\app\*.bat" >nul 2>&1
del /f /q "dist\app\*.sh" >nul 2>&1
del /f /q "dist\app\tsconfig*" >nul 2>&1

echo       App folder ready.

:: ── Step 4: Create Smart Launcher (with port scan) ────────────
echo [4/4] Creating launcher with auto port scan...

> "dist\Start Jira Dashboard.bat" (
    echo @echo off
    echo setlocal enabledelayedexpansion
    echo title Jira ETL Dashboard
    echo.
    echo :: ─── Locate node.exe ────────────────────────────────────────────
    echo set "NODE_BIN="
    echo where node.exe ^>nul 2^>^&1
    echo if %%errorlevel%% equ 0 ^(
    echo     set "NODE_BIN=node.exe"
    echo ^) else if exist "%%~dp0node.exe" ^(
    echo     set "NODE_BIN=%%~dp0node.exe"
    echo ^) else ^(
    echo     echo [ERROR] node.exe not found. Please place node.exe in the same folder as this script.
    echo     pause
    echo     exit /b 1
    echo ^)
    echo.
    echo :: ─── Auto Port Scan ─────────────────────────────────────────────
    echo set "PORT=3000"
    echo :find_port
    echo netstat -ano ^| find "0.0.0.0:%%PORT%% " ^>nul 2^>^&1
    echo if %%errorlevel%% equ 0 ^(
    echo     echo   Port %%PORT%% is occupied, trying next...
    echo     set /a PORT+=1
    echo     if %%PORT%% gtr 3100 ^(
    echo         echo [ERROR] No available port found in range 3000-3100.
    echo         pause
    echo         exit /b 1
    echo     ^)
    echo     goto find_port
    echo ^)
    echo.
    echo :: ─── Set Environment ─────────────────────────────────────────────
    echo set "DB_ABS=%%~dp0app\db\custom.db"
    echo set "DB_ABS=%%DB_ABS:\=/%%"
    echo set "DATABASE_URL=file:%%DB_ABS%%"
    echo set "NODE_ENV=production"
    echo.
    echo echo.
    echo echo   =============================================
    echo echo     Jira ETL Dashboard
    echo echo   =============================================
    echo echo   Starting on port: %%PORT%%
    echo echo   URL: http://localhost:%%PORT%%
    echo echo   Press Ctrl+C to stop.
    echo echo   =============================================
    echo echo.
    echo.
    echo cd /d "%%~dp0app"
    echo "%%NODE_BIN%%" server.js
    echo pause
)

echo.
echo ============================================================
echo   SUCCESS! Portable build ready in 'dist' folder.
echo.
echo   Contents:
echo   - dist\app\          ^(bundled Next.js server^)
echo   - dist\app\db\       ^(SQLite database^)
echo   - dist\Start Jira Dashboard.bat  ^(smart launcher^)
echo.
echo   To run: double-click "dist\Start Jira Dashboard.bat"
echo   Node.js will be located automatically. If not in PATH,
echo   place node.exe next to the .bat file.
echo ============================================================
echo.
pause
