@echo off
setlocal enabledelayedexpansion
title Jira ETL Dashboard

:: Find Node.js (system or local)
set "NODE_BIN=node"
where !NODE_BIN! >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%~dp0node.exe" (
        set "NODE_BIN=%~dp0node.exe"
    ) else if exist "%~dp0bin\node.exe" (
        set "NODE_BIN=%~dp0bin\node.exe"
    ) else (
        echo [ERROR] Node.js is not installed and no local node.exe found.
        echo Please copy 'node.exe' to "%~dp0" or install Node.js.
        pause
        exit /b 1
    )
)

:: Move to the app folder
cd /d "%~dp0app"

:: Set absolute DATABASE_URL for the app
set "DB_ABS=%~dp0app\db\custom.db"
set "DB_ABS=%DB_ABS:\=/%"
set "DATABASE_URL=file:%DB_ABS%"

echo  =============================================
echo    Jira ETL Dashboard
echo  =============================================
echo.
echo  Server starting at http://localhost:3000
echo  Press Ctrl+C to stop.
echo.
set NODE_ENV=production
"!NODE_BIN!" server.js
pause
