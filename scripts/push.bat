@echo off
setlocal

set IMAGE=time4action/t4a-chat-ui

:: Determine tag
if "%~1"=="--latest" (
    set TAG=latest
) else if "%~1"=="--dev" (
    set TAG=dev
) else (
    for /f "tokens=*" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"') do set TAG=%%i
)

echo [push] Pushing %IMAGE%:%TAG%...

docker push %IMAGE%:%TAG%
if %ERRORLEVEL% neq 0 (
    echo [push] Push failed!
    exit /b 1
)

echo [push] Done: %IMAGE%:%TAG%

endlocal
