@echo off
title JIRA ETL Dashboard - Build EXE
setlocal enabledelayedexpansion

echo =============================================
echo  Building JIRA ETL Dashboard Executable
echo =============================================
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed.
    echo Please install Node.js from https://nodejs.org/
    if not defined CI pause
    exit /b 1
)

:: Check if npm is available
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not available.
    if not defined CI pause
    exit /b 1
)

echo [1/5] Cleaning previous build artifacts...
if exist "prisma\generated" (
    rmdir /s /q "prisma\generated"
)
if exist "dist" (
    rmdir /s /q "dist"
)
echo Done.
echo.

echo [2/5] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed.
    if not defined CI pause
    exit /b 1
)
echo Done.
echo.

echo [3/5] Building Next.js app...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed.
    if not defined CI pause
    exit /b 1
)
echo Done.
echo.

echo [4/5] Preparing standalone output for packaging...
:: Remove duplicate node_modules from Next.js build output
if exist ".next\standalone\.next\node_modules" (
    rmdir /s /q ".next\standalone\.next\node_modules"
)
:: Copy launcher script into the standalone output
copy /y "launcher.cjs" ".next\standalone\launcher.cjs" >nul

:: Create a clean schema-only database template for first-run bootstrap
call node scripts/create-db-template.mjs
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create database template.
    if not defined CI pause
    exit /b 1
)
if not exist ".next\standalone\db" mkdir ".next\standalone\db"
copy /y "db\template.db" ".next\standalone\db\template.db" >nul

:: Remove development databases so they are not shipped inside the exe.
:: The launcher creates a fresh database from the template on first run.
del /f /q ".next\standalone\db\custom.db" >nul 2>&1
del /f /q ".next\standalone\prisma\db\custom.db" >nul 2>&1
echo Done.
echo.

echo [5/5] Packaging executable with caxa...
call npx caxa --input ".next/standalone" --output "dist\JIRA ETL Dashboard.exe" --no-dedupe -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/launcher.cjs"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Packaging failed.
    if not defined CI pause
    exit /b 1
)
echo Done.
echo.

echo =============================================
echo  Build complete!
echo  File: dist\JIRA ETL Dashboard.exe
echo =============================================
if not defined CI pause