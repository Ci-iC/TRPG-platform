@echo off
REM ====================================================================
REM  TRPG Platform - one-click start (ASCII only on purpose)
REM  1) start postgres via docker  2) install deps  3) migrate  4) run
REM ====================================================================
setlocal
cd /d "%~dp0"

echo [1/4] Starting PostgreSQL (docker compose)...
docker compose up -d db
if errorlevel 1 (
  echo.
  echo  ERROR: docker compose failed. Make sure Docker Desktop is running.
  echo  Then run this script again.
  pause
  exit /b 1
)

echo [2/4] Waiting for database to be ready...
set /a TRIES=0
:waitdb
docker exec trpg-postgres pg_isready -U trpg -d trpg >nul 2>&1
if %errorlevel%==0 goto dbready
set /a TRIES+=1
if %TRIES% GEQ 40 (
  echo  ERROR: database did not become ready in time.
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto waitdb
:dbready
echo      database is ready.

echo [3/4] Installing dependencies (first run only, may take a while)...
if not exist "node_modules" call npm install --no-audit --no-fund
if not exist "server\node_modules" call npm --prefix server install --no-audit --no-fund
if not exist "client\node_modules" call npm --prefix client install --no-audit --no-fund

echo      Running database migration / seed...
call node server\src\migrate.js
if errorlevel 1 (
  echo  ERROR: migration failed.
  pause
  exit /b 1
)

echo [4/4] Starting servers...
echo.
echo  The browser will open http://localhost:5173 automatically in a moment.
echo  Backend: http://localhost:4100   Login: admin / admin888
echo.
echo  KEEP THIS WINDOW OPEN while playing. Closing it stops the servers.
echo  (The "monitoring/HMR" output below is normal - it is NOT stuck.)
echo.
call npm run dev

endlocal
