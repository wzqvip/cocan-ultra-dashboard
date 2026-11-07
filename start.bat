@echo off
setlocal
cd /d "%~dp0"

echo [cocan-ultra-dashboard] starting zero-dependency proxy on http://127.0.0.1:8787
echo [cocan-ultra-dashboard] press Ctrl+C to stop
echo.

node server.mjs
if errorlevel 1 (
  echo.
  echo [cocan-ultra-dashboard] server exited with an error.
  echo [cocan-ultra-dashboard] Node.js 18+ is required: https://nodejs.org/
  pause
)

endlocal
