@echo off
setlocal
cd /d %~dp0

if not exist service.pid (
    echo [WARN] Файл service.pid не найден. Возможно, сервис уже остановлен.
    goto :eof
)

set /p SERVICE_PID=<service.pid
if "%SERVICE_PID%"=="" (
    echo [ERROR] Не удалось прочитать PID из service.pid
    goto :eof
)

echo [INFO] Останавливаем процесс %SERVICE_PID%
taskkill /PID %SERVICE_PID% /T /F >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] taskkill вернул код %ERRORLEVEL%
) else (
    echo [INFO] Процесс завершён
)

del service.pid >nul 2>&1
endlocal
