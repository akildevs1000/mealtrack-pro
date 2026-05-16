@echo off
REM Launch backend (Express) and frontend (Vite) dev servers in separate windows.
REM Each opens its own console so you can Ctrl+C either one independently.

setlocal
set "ROOT=%~dp0"

start "mealtrack-pro :: backend"  cmd /k "cd /d "%ROOT%server" && npm run dev"
start "mealtrack-pro :: frontend" cmd /k "cd /d "%ROOT%" && npm run dev"

endlocal
