@echo off
setlocal
cd /d "%~dp0"

echo Starting quote engine API on http://127.0.0.1:8000
start "Quote Engine" cmd /k "cd /d "%~dp0quote_engine" && run.bat"

timeout /t 4 /nobreak >nul

echo Starting agent frontend on http://127.0.0.1:5173
start "InsureAI Frontend" cmd /k "cd /d "%~dp0Frontend" && run.bat"
