@echo off
setlocal enabledelayedexpansion
title Jira ETL Dashboard - Production Build

:: ── Distribution layouts (read before "fixing" either one) ──────
:: 1. Portable folder build  (THIS script, and build-production.sh):
::    Output is a copyable folder. The database lives at app\db\custom.db,
::    NEXT TO the server, so all data travels with the folder
::    (local disk, share, USB stick). Do not move it to an app-data dir.
:: 2. Single-executable build (build-exe.bat / build-exe.sh via caxa,
::    launched by launcher.cjs): the exe self-extracts into a volatile
::    temp dir, so its database lives in the platform app-data directory
::    (or JIRA_ETL_DATA_DIR if set). See the header of launcher.cjs.
:: Both formats scan ports 3200-3299 (3000 is reserved for `npm run dev`).
:: -----------------------------------------------------------------

echo ============================================================
echo   Jira ETL Dashboard - Production Build
echo ============================================================
echo.

:: ── Step 1: Clean and Prepare ─────────────────────────────────
echo [1/5] Cleaning up previous builds and checking for locks...

:: Check for running node processes that might lock Prisma files
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I /N "node.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo ! Warning: Multiple 'node.exe' processes are running.
    echo   This often causes EPERM errors during Prisma generation.
    echo.
    echo   Running Node processes:
    tasklist /FI "IMAGENAME eq node.exe" /FO TABLE /NH
    echo.
    set /p KILL_PIDS="Enter PID(s) to kill (comma-separated, or press Enter to skip): "
    if not "!KILL_PIDS!"=="" (
        echo   Stopping selected Node processes...
        for %%p in (!KILL_PIDS!) do (
            taskkill /F /PID %%p >nul 2>&1
            echo     Killed PID %%p
        )
        echo   Done.
    ) else (
        echo   Proceeding without stopping processes. If build fails, please close them manually.
    )
    echo.
)

if exist "dist" rd /s /q "dist" >nul 2>&1
mkdir "dist\app"
echo       Done.

:: ── Step 2: Build Application ─────────────────────────────────
echo [2/5] Building Next.js application (standalone mode)...
set NODE_ENV=production
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo       Build successful.

:: ── Step 3: Assemble dist\app folder ──────────────────────────
echo [3/5] Assembling portable app folder...

:: Copy standalone server + static assets
xcopy /s /e /y ".next\standalone" "dist\app\" >nul
if not exist "dist\app\.next\static" mkdir "dist\app\.next\static"
xcopy /s /e /y ".next\static" "dist\app\.next\static\" >nul
xcopy /s /e /y "public" "dist\app\public\" >nul

:: Copy the database template (the launcher creates the real database
:: from it on first run, so user data survives app updates)
call node scripts/create-db-template.mjs
if %errorlevel% neq 0 (
    echo [ERROR] Failed to create database template.
    pause
    exit /b 1
)
if not exist "dist\app\db" mkdir "dist\app\db"
copy /y "db\template.db" "dist\app\db\template.db" >nul

:: Remove dev/build files that leaked into standalone
del /f /q "dist\app\*.md" >nul 2>&1
del /f /q "dist\app\*.bat" >nul 2>&1
del /f /q "dist\app\*.sh" >nul 2>&1
del /f /q "dist\app\tsconfig*" >nul 2>&1

echo       App folder ready.

:: ── Step 4: Create Smart Launcher (with port scan) ────────────
echo [4/5] Creating launcher with auto port scan...

> "dist\Start Jira Dashboard.bat" (
    echo @echo off
    echo setlocal enabledelayedexpansion
    echo title Jira ETL Dashboard
    echo.
    echo :: ─── Locate node.exe ────────────────────────────────────────────
    echo set "NODE_BIN=node"
    echo %%SystemRoot%%\System32\where.exe node.exe ^>nul 2^>^&1
    echo if %%errorlevel%% equ 0 ^(
    echo     set "NODE_BIN=node.exe"
    echo ^) else if exist "%%~dp0app\node.exe" ^(
    echo     set "NODE_BIN=%%~dp0app\node.exe"
    echo ^) else ^(
    echo     echo [ERROR] node.exe not found. Please place node.exe in the 'app' folder.
    echo     pause
    echo     exit /b 1
    echo ^)
    echo.
    echo :: ─── Find a free port in 3200-3299, matching launcher.cjs; port 3000 is for npm run dev ───
    echo set "PORT=3200"
    echo :find_port
    echo %%SystemRoot%%\System32\netstat.exe -ano ^| %%SystemRoot%%\System32\findstr.exe /R /C:":%%PORT%% " ^| %%SystemRoot%%\System32\findstr.exe "LISTENING" ^>nul 2^>^&1
    echo if %%errorlevel%% equ 0 ^(
    echo     echo   Port %%PORT%% is occupied, trying next...
    echo     set /a PORT+=1
    echo     if %%PORT%% gtr 3299 ^(
    echo         echo [ERROR] No available port found in range 3200-3299.
    echo         pause
    echo         exit /b 1
    echo     ^)
    echo     goto find_port
    echo ^)
    echo.
    echo :: ─── First Run: Create Database From Template ─────────────────────
    echo if not exist "%%~dp0app\db\custom.db" if exist "%%~dp0app\db\template.db" copy /y "%%~dp0app\db\template.db" "%%~dp0app\db\custom.db" ^>nul
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
    echo echo   Database: %%~dp0app\db\custom.db
    echo echo   Press Ctrl+C to stop.
    echo echo   =============================================
    echo echo.
    echo.
    echo cd /d "%%~dp0app"
    echo "%%NODE_BIN%%" server.js
    echo pause
)

echo       Launcher created.

:: ── Step 5: Bundle Node.js runtime (for portability) ──────────
echo [5/5] Bundling Node.js runtime...
set "NODE_PATH="
for /f "tokens=*" %%i in ('where node.exe') do (
    set "NODE_PATH=%%i"
    goto :node_found
)

:node_found
if defined NODE_PATH (
    copy /y "!NODE_PATH!" "dist\app\node.exe" >nul
    echo       node.exe bundled into dist\app\ from !NODE_PATH!
) else (
    echo       ! Warning: node.exe not found in PATH. Build will require node.exe to be added manually to dist\app\.
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
