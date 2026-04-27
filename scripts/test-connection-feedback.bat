@echo off
echo Testing Connection Test Improvements
echo =====================================
echo.

echo This will test the improved connection test endpoints
echo You should now see clear success/failure messages
echo.

echo Step 1: Test Jira Connection (Invalid - should show clear error)
echo --------------------------------------------------------------
curl -s -X POST http://localhost:3000/api/jira/test ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\":\"https://invalid-domain.atlassian.net\",\"email\":\"test@example.com\",\"apiToken\":\"invalidtoken\"}"
echo.
echo.

echo Step 2: Test PostgreSQL Connection (Invalid - should show clear error)
echo ----------------------------------------------------------------------
curl -s -X POST http://localhost:3000/api/pg/test ^
  -H "Content-Type: application/json" ^
  -d "{\"host\":\"localhost\",\"port\":\"5432\",\"database\":\"nonexistent\",\"username\":\"testuser\",\"password\":\"wrongpassword\"}"
echo.
echo.

echo Step 3: Test Missing Required Fields
echo --------------------------------------
curl -s -X POST http://localhost:3000/api/jira/test ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\":\"\",\"email\":\"\",\"apiToken\":\"\"}"
echo.
echo.

echo =====================================
echo Expected Results:
echo =====================================
echo.
echo Step 1: Should return 400 status with:
echo   - success: false
echo   - message: "Connection failed"
echo   - diagnostics with suggestions
echo.
echo Step 2: Should return 400 status with:
echo   - success: false
echo   - message: "Connection failed"
echo   - diagnostics with suggestions
echo.
echo Step 3: Should return 400 status with:
echo   - success: false
echo   - message: "Validation failed"
echo   - Specific field errors
echo.

pause