@echo off
setlocal
:: All changes to PATH inside here are temporary
set PATH=
echo Testing with empty PATH...
call ".\release\Start Jira Dashboard.bat"
endlocal
:: Now PATH is automatically restored to exactly what it was before!
