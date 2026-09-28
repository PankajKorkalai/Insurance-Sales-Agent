@echo off
setlocal
set "ROOT=%~dp0"
if exist "%ROOT%.venv\Scripts\python.exe" (
    set "PY=%ROOT%.venv\Scripts\python.exe"
) else (
    set "PY=python"
)
set PYTHONIOENCODING=utf-8
"%PY%" "%ROOT%src\cli.py" %*
