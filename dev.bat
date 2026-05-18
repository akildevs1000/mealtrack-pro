@echo off
REM Launch backend (port 5044) and frontend (port 8044) in separate windows.
REM Frees the ports first so a stale node/tsx process won't block startup.

setlocal
set "ROOT=%~dp0"

echo Freeing port 5044 (backend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5044 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo Freeing port 8044 (frontend)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8044 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

start "mealtrack-pro :: backend"  cmd /k "cd /d "%ROOT%server" && set PORT=5044 && npm run dev"
start "mealtrack-pro :: frontend" cmd /k "cd /d "%ROOT%" && npm run dev -- --port 8044"

endlocal
