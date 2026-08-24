@echo off
echo ======================================
echo Windows Setup for Jira ETL Dashboard
echo ======================================
echo.

echo Checking system requirements...
echo.

:: Check Node.js
echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js is installed
node --version

:: Check npm
echo Checking npm installation...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not installed!
    pause
    exit /b 1
)
echo ✅ npm is installed
npm --version
echo.

:: Check available memory
echo Checking system resources...
wmic OS get FreePhysicalMemory /value >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Could not check memory
) else (
    echo ✅ Memory check available
)
echo.

:: Check if dependencies are installed
echo Checking project dependencies...
if exist "node_modules" (
    echo ✅ Dependencies already installed
    echo.
    set /p reinstall="Do you want to reinstall dependencies? (y/n): "
    if /i "%reinstall%"=="y" (
        echo Reinstalling dependencies...
        call npm install
    )
) else (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed successfully
)
echo.

:: Check Prisma
echo Setting up database...
if exist "node_modules\.prisma" (
    echo ✅ Prisma client exists
) else (
    echo Generating Prisma client...
    call npm run db:generate
    if errorlevel 1 (
        echo ❌ Failed to generate Prisma client
        pause
        exit /b 1
    )
    echo ✅ Prisma client generated
)
echo.

:: Check database
echo Checking database setup...
if exist "db\custom.db" (
    echo ✅ Database file exists
    echo.
    set /p resetdb="Do you want to reset the database? (y/n): "
    if /i "%resetdb%"=="y" (
        echo Resetting database...
        call npm run db:push
    )
) else (
    echo Creating database...
    call npm run db:push
    if errorlevel 1 (
        echo ❌ Failed to create database
        pause
        exit /b 1
    )
    echo ✅ Database created successfully
)
echo.

:: Check port availability
echo Checking if port 3000 is available...
netstat -ano | findstr :3000 >nul 2>&1
if errorlevel 1 (
    echo ✅ Port 3000 is available
) else (
    echo ⚠️  Port 3000 is already in use
    echo.
    echo Current connections on port 3000:
    netstat -ano | findstr :3000
    echo.
    set /p killport="Do you want to kill the process using port 3000? (y/n): "
    if /i "%killport%"=="y" (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
            echo Killing process %%a...
            taskkill /PID %%a /F
        )
        echo ✅ Process killed
    )
)
echo.

:: Display available commands
echo ======================================
echo Available Commands
echo ======================================
echo.
echo Development:
echo   npm run dev              - Start development server
echo   npm run dev:turbo        - Start with Turbopack (faster)
echo   npm run dev:low-memory   - Start with memory limits
echo   npm run dev:clean        - Clean and start
echo.
echo Database:
echo   npm run db:push          - Push schema changes
echo   npm run db:generate      - Generate Prisma client
echo   npm run db:studio        - Open Prisma Studio
echo.
echo Maintenance:
echo   npm run clean            - Clean cache
echo   npm run lint             - Check code quality
echo   npm run type-check       - Type checking
echo.
echo Utilities:
echo   scripts\memory-health.bat    - Check memory usage
echo.
echo ======================================
echo.

:: Ask to start server
set /p startserver="Would you like to start the development server? (y/n): "
if /i "%startserver%"=="y" (
    echo.
    echo Starting development server...
    echo Server will be available at: http://localhost:3000
    echo Press Ctrl+C to stop the server
    echo.
    call npm run dev
) else (
    echo.
    echo Setup complete! You can start the server anytime with: npm run dev
    echo.
)

pause