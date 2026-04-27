@echo off
echo Testing API Error Handling & Features
echo =====================================
echo.

echo 1. Testing Health Check Endpoint...
curl -s http://localhost:3000/api/debug/health
echo.
echo.

echo 2. Testing Health Check (Detailed)...
curl -s "http://localhost:3000/api/debug/health?detailed=true"
echo.
echo.

echo 3. Testing PostgreSQL Connections (GET)...
curl -s http://localhost:3000/api/pg/connections
echo.
echo.

echo 4. Testing Jira Connections (GET)...
curl -s http://localhost:3000/api/jira/connections
echo.
echo.

echo 5. Testing Validation Error (Invalid POST)...
curl -s -X POST http://localhost:3000/api/pg/connections ^
  -H "Content-Type: application/json" ^
  -d "{\"invalid\": \"data\"}"
echo.
echo.

echo 6. Testing Rate Limiting (Multiple Requests)...
for /l %%i in (1,1,5) do (
  echo Request %%i:
  curl -s http://localhost:3000/api/pg/connections
  echo.
)
echo.

echo =====================================
echo Test Complete!
echo.
echo Expected Results:
echo - Requests 1-3: Should return 200 OK with connections list
echo - Request 4: Should trigger rate limit warning
echo - Invalid POST: Should return 400 validation error
pause