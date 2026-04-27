@echo off
echo Testing Validation Fixes
echo =========================
echo.

echo Testing valid API token (100+ characters)...
curl -s -X POST http://localhost:3000/api/jira/connections ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Test Connection\",\"baseUrl\":\"https://test.atlassian.net\",\"apiToken\":\"1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890\",\"email\":\"test@example.com\",\"projectKeys\":[\"TEST\"]}"
echo.
echo.

echo Testing invalid URL format...
curl -s -X POST http://localhost:3000/api/jira/connections ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Test Connection\",\"baseUrl\":\"not-a-valid-url\",\"apiToken\":\"token123\",\"email\":\"test@example.com\",\"projectKeys\":[\"TEST\"]}"
echo.
echo.

echo Testing empty API token...
curl -s -X POST http://localhost:3000/api/jira/connections ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Test Connection\",\"baseUrl\":\"https://test.atlassian.net\",\"apiToken\":\"\",\"email\":\"test@example.com\",\"projectKeys\":[\"TEST\"]}"
echo.
echo.

pause