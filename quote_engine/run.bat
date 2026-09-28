@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Virtual environment not found. Run: python -m venv .venv ^&^& .venv\Scripts\python -m pip install -r requirements.txt
    exit /b 1
)
echo Starting Motor Insurance Quote Engine at http://127.0.0.1:8000
start "" "http://127.0.0.1:8000/"
".venv\Scripts\python.exe" -m uvicorn main:app --app-dir src --port 8000 --reload
