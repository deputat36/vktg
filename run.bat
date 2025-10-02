@echo off
setlocal
cd /d %~dp0

if not exist .venv (
    echo [INFO] Создаём виртуальное окружение .venv
    python -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
pip install -r requirements.txt

echo [INFO] Запускаем сервис
start "VKTG Service" cmd /c "cd /d %~dp0 && call run_internal.bat"
endlocal
