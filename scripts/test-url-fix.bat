@echo off
echo Testing URL Auto-Protocol Fix
echo ================================
echo.

echo Testing various URL formats that should all work:
echo.

echo Test 1: URL without protocol (eu-coc.atlassian.net)
curl -s -X POST http://localhost:3000/api/jira/test ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\":\"eu-coc.atlassian.net\",\"email\":\"test@example.com\",\"apiToken\":\"testtoken123\"}" ^
  | findstr /C:"success" /C:"baseUrl"
echo.
echo.

echo Test 2: URL with https:// (https://eu-coc.atlassian.net)
curl -s -X POST http://localhost:3000/api/jira/test ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\":\"https://eu-coc.atlassian.net\",\"email\":\"test@example.com\",\"apiToken\":\"testtoken123\"}" ^
  | findstr /C:"success" /C:"baseUrl"
echo.
echo.

echo Test 3: URL with http:// (http://eu-coc.atlassian.net)
curl -s -X POST http://localhost:3000/api/jira/test ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\":\"http://eu-coc.atlassian.net\",\"email\":\"test@example.com\",\"apiToken\":\"testtoken123\"}" ^
  | findstr /C:"success" /C:"baseUrl"
echo.
echo.

echo Test 4: URL with trailing slash (eu-coc.atlassian.net/)
curl -s -X POST http://localhost:3000/api/jira/test ^
  -H "Content-Type: application/json" ^
  -d "{\"baseUrl\":\"eu-coc.atlassian.net/\",\"email\":\"test@example.com\",\"apiToken\":\"testtoken123\"}" ^
  | findstr /C:"success" /C:"baseUrl"
echo.
echo.

echo ================================
echo Expected Results:
echo All tests should show:
echo - URL normalized to: https://eu-coc.atlassian.net
echo - success: false (because credentials are invalid)
echo - But NO URL parsing errors!
echo ================================
pause