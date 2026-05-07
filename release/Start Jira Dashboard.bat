@echo off
setlocal enabledelayedexpansion
title Jira ETL Dashboard

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
node server.js
pause
