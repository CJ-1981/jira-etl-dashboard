@echo off
REM ============================================================
REM build-relay-exe.bat - build the standalone Jira ETL relay exe
REM
REM Packages scripts/jira_relay.py into dist\jira-relay.exe with
REM PyInstaller. The exe bundles Python, so end users do NOT need
REM Python installed - they just run jira-relay.exe next to a
REM relay.env config file (see scripts\relay.env.example).
REM
REM Build machine requirements: Python 3.10+ on PATH (only used
REM here, not by the resulting exe). Everything else (venv,
REM PyInstaller) is created in .venv-relay\ automatically.
REM ============================================================

setlocal
REM This script lives in the repo root — work from there.
cd /d "%~dp0"

echo [build-relay] === Building standalone Jira ETL relay ===

where python >nul 2>nul
if errorlevel 1 (
    echo [build-relay] ERROR: Python not found on PATH.
    echo [build-relay]        Install Python 3.10+ from https://www.python.org/downloads/
    echo [build-relay]        (only the BUILD machine needs it - the exe does not^) and re-run.
    exit /b 1
)

if not exist ".venv-relay\Scripts\python.exe" (
    echo [build-relay] Creating build virtual environment .venv-relay ...
    python -m venv .venv-relay
    if errorlevel 1 (
        echo [build-relay] ERROR: failed to create .venv-relay
        exit /b 1
    )
)

".venv-relay\Scripts\python.exe" -m PyInstaller --version >nul 2>nul
if errorlevel 1 (
    echo [build-relay] Installing PyInstaller into .venv-relay ...
    ".venv-relay\Scripts\python.exe" -m pip install --quiet pyinstaller
    if errorlevel 1 (
        echo [build-relay] ERROR: pip install pyinstaller failed
        exit /b 1
    )
)

echo [build-relay] Compiling dist\jira-relay.exe ...
".venv-relay\Scripts\python.exe" -m PyInstaller --clean --noconfirm --onefile --name jira-relay scripts\jira_relay.py
if errorlevel 1 (
    echo [build-relay] ERROR: PyInstaller build failed
    exit /b 1
)

if not exist "dist\jira-relay.exe" (
    echo [build-relay] ERROR: expected dist\jira-relay.exe not found
    exit /b 1
)

REM ============================================================
REM Optional code signing (Authenticode). Skipped when no cert is
REM configured. Set ONE of:
REM   JIRA_RELAY_SIGN_PFX + JIRA_RELAY_SIGN_PASSWORD
REM       - cert in a .pfx file (self-signed, internal CA, or a
REM         pre-2023 purchased cert)
REM   JIRA_RELAY_SIGN_THUMBPRINT
REM       - cert in the Windows cert store, referenced by SHA-1
REM         thumbprint (USB token / smart card certs register here)
REM See docs\STATIC_RELAY_MODE.md - Code signing.
REM ============================================================
call :find_signtool
if errorlevel 1 (
    echo [build-relay] NOTE: signtool not found ^(install the Windows SDK^) - skipping code signing.
    goto :signedone
)
if defined JIRA_RELAY_SIGN_PFX (
    echo [build-relay] Signing dist\jira-relay.exe with PFX cert ...
    if not defined JIRA_RELAY_SIGN_PASSWORD (
        echo [build-relay] ERROR: JIRA_RELAY_SIGN_PFX set but JIRA_RELAY_SIGN_PASSWORD missing
        exit /b 1
    )
    "%SIGNTOOL%" sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f "%JIRA_RELAY_SIGN_PFX%" /p "%JIRA_RELAY_SIGN_PASSWORD%" dist\jira-relay.exe
    if errorlevel 1 (
        echo [build-relay] ERROR: signtool sign failed
        exit /b 1
    )
) else if defined JIRA_RELAY_SIGN_THUMBPRINT (
    echo [build-relay] Signing dist\jira-relay.exe with cert-store thumbprint ...
    "%SIGNTOOL%" sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /sha1 "%JIRA_RELAY_SIGN_THUMBPRINT%" dist\jira-relay.exe
    if errorlevel 1 (
        echo [build-relay] ERROR: signtool sign failed
        exit /b 1
    )
) else (
    echo [build-relay] NOTE: no signing cert configured - skipping code signing.
    echo [build-relay]        Set JIRA_RELAY_SIGN_PFX + JIRA_RELAY_SIGN_PASSWORD, or JIRA_RELAY_SIGN_THUMBPRINT. See docs\STATIC_RELAY_MODE.md
    goto :signedone
)
"%SIGNTOOL%" verify /pa dist\jira-relay.exe
if errorlevel 1 (
    echo [build-relay] WARNING: signature verification failed ^(self-signed certs need the issuer in Trusted Roots^)
) else (
    echo [build-relay] Signature verified.
)
:signedone

echo.
echo [build-relay] Done: dist\jira-relay.exe
echo [build-relay] Deploy next to a relay.env file (template: scripts\relay.env.example^):
echo [build-relay]   1. Copy jira-relay.exe + relay.env to a folder of your choice
echo [build-relay]   2. Edit relay.env (Jira URL / email / API token)
echo [build-relay]   3. Double-click jira-relay.exe - the dashboard connects to http://localhost:8765
echo [build-relay] See docs\STATIC_RELAY_MODE.md for details.

endlocal
exit /b 0

:find_signtool
REM Locate signtool: PATH first, then the newest Windows SDK under Program Files (x86).
REM @MX:NOTE: kept flat on purpose - a `for /f` with an escaped pipe (^|) inside a
REM parenthesized block loses its carets at block-parse time and silently breaks.
set "SIGNTOOL="
where signtool >nul 2>nul && (
    set "SIGNTOOL=signtool"
    exit /b 0
)
set "SDKROOT=%ProgramFiles(x86)%\Windows Kits\10\bin"
if not exist "%SDKROOT%" exit /b 1
set "SDKNEWEST="
for /f "delims=" %%v in ('dir /b /ad /on "%SDKROOT%" 2^>nul ^| findstr /r "^[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*$"') do set "SDKNEWEST=%%v"
if not defined SDKNEWEST exit /b 1
if not exist "%SDKROOT%\%SDKNEWEST%\x64\signtool.exe" exit /b 1
set "SIGNTOOL=%SDKROOT%\%SDKNEWEST%\x64\signtool.exe"
exit /b 0
