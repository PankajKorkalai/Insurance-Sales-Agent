@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (
    echo Installing frontend dependencies...
    call npm install
)
echo Starting agent app at http://127.0.0.1:5173
echo The quote engine must already be running on http://127.0.0.1:8000
start "" "http://127.0.0.1:5173/"
call npm run dev
