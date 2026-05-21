@echo off
REM Launch backend (port 5044) and frontend (port 8044) in separate windows.
REM
REM IMPORTANT: a `tsx watch` backend is a supervisor that RESPAWNS its child
REM when the child dies, so killing the port listener alone is not enough — the
REM watcher just re-binds the port. We therefore kill any node process for THIS
REM project by command line first, then free the ports as a fallback.

setlocal
set "ROOT=%~dp0"

echo Stopping any running mealtrack-pro dev processes (tsx watch / vite)...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like '*mealtrack-pro*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM Belt-and-braces: free the ports too, in case anything wasn't matched above.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5044 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8044 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM Give the OS a moment to release the sockets before rebinding.
timeout /t 1 /nobreak >nul

start "mealtrack-pro :: backend"  cmd /k "cd /d "%ROOT%server" && set PORT=5044 && npm run dev"
start "mealtrack-pro :: frontend" cmd /k "cd /d "%ROOT%" && npm run dev -- --port 8044"

endlocal
