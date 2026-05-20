@echo off
REM ============================================================
REM  MealOps manual audit
REM
REM  Usage:
REM    audit.bat          lint + typecheck (frontend + backend) + API smoke tests
REM    audit.bat full     also runs the production builds (slower)
REM
REM  To audit a DIFFERENT server (e.g. live), set env vars first:
REM    set API_BASE=http://139.59.69.241:5044/api
REM    set ADMIN_USER=admin
REM    set ADMIN_PASS=your-admin-password
REM    audit.bat
REM ============================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "FAIL=0"
set "AUDIT_API=%API_BASE%"
if "%AUDIT_API%"=="" set "AUDIT_API=http://localhost:5044/api"

echo ============================================================
echo  MealOps audit   (API: %AUDIT_API%)
echo ============================================================

echo.
echo --- Frontend lint ---
call npm run lint || set "FAIL=1"

echo.
echo --- Frontend typecheck ---
call npx tsc --noEmit || set "FAIL=1"

echo.
echo --- Backend typecheck ---
pushd server
call npx tsc -p tsconfig.json --noEmit || set "FAIL=1"
popd

if /I "%~1"=="full" (
  echo.
  echo --- Frontend build ---
  call npm run build || set "FAIL=1"
  echo.
  echo --- Backend build ---
  pushd server
  call npm run build || set "FAIL=1"
  popd
)

echo.
echo --- Backend health check ---
curl -fs -m 5 "%AUDIT_API%/health" >NUL 2>&1
if errorlevel 1 (
  echo  Backend NOT reachable at %AUDIT_API% - skipping API smoke tests.
  echo  Start it first:   cd server ^&^& npm run dev
) else (
  echo  Backend healthy - running smoke tests...
  pushd server
  echo.
  echo --- Manager flow ---
  call npx tsx scripts/test-manager-flow.ts || set "FAIL=1"
  echo.
  echo --- Device flow ---
  call npx tsx scripts/test-device-flow.ts || set "FAIL=1"
  popd
)

echo.
echo ============================================================
if "%FAIL%"=="0" (
  echo   AUDIT PASSED
) else (
  echo   AUDIT FAILED - review the output above
)
echo ============================================================
endlocal & exit /b %FAIL%
