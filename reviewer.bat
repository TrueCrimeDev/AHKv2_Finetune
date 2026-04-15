@echo off
REM AHK Training Data Reviewer - Web UI
REM Launches the web-based script review tool

cd /d "%~dp0tools\web-reviewer"

REM Activate venv if it exists
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)

echo Starting AHK Training Reviewer...
echo Open http://localhost:8000 in your browser
echo.

python app.py
