@echo off
setlocal
cd /d "%~dp0"

if not exist .venv (
    echo Creating virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate
echo Installing requirements...
pip install -r requirements.txt
echo Seeding database...
python -m app.seed
echo Starting FastAPI server...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload