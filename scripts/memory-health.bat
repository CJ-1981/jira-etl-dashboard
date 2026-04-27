@echo off
echo 🔍 Memory Health Check for Jira ETL Dashboard
echo =============================================
echo.

echo 📊 Current Node.js Processes:
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
echo.

echo 💾 Memory Usage:
wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value
echo.

echo 📦 Cache Sizes:
if exist ".next" (
    echo Next.js build cache: exists
) else (
    echo Next.js build cache: not found
)
if exist "node_modules\.cache" (
    echo Node modules cache: exists
) else (
    echo Node modules cache: not found
)
echo.

echo 💡 Recommendations:
echo ℹ️  Monitor memory usage in Task Manager
echo ⚠️  If experiencing issues, try:
echo    npm run dev:clean
echo    npm run dev:low-memory
echo.

echo 🔧 Quick Actions:
echo    npm run dev:clean    - Clean cache and restart
echo    npm run dev:low-memory - Run with limited memory
echo    npm run clean        - Clean cache only
echo.

set /p cleanup="Would you like to clean the cache? (y/n): "
if /i "%cleanup%"=="y" (
    echo 🧹 Cleaning cache...
    call npm run clean
    echo ✅ Cache cleaned!
    echo.
    set /p startdev="Start development server? (y/n): "
    if /i "%startdev%"=="y" (
        call npm run dev
    )
)

pause