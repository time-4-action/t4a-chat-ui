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

echo [build] Reading .env.local for NEXT_PUBLIC_ build args...

powershell -NoProfile -Command ^
  "$env = @{};" ^
  "Get-Content '.env.local' | Where-Object { $_ -match '^\s*[A-Za-z]' } | ForEach-Object {" ^
  "  $parts = $_ -split '=', 2;" ^
  "  if ($parts.Count -eq 2) { $env[$parts[0].Trim()] = $parts[1].Trim() }" ^
  "};" ^
  "$appName   = $env['NEXT_PUBLIC_APP_NAME'];" ^
  "$color     = $env['NEXT_PUBLIC_COMPANY_COLOR'];" ^
  "$deepgram  = $env['NEXT_PUBLIC_DEEPGRAM_API_KEY'];" ^
  "Write-Host \"[build] Building %IMAGE%:%TAG%...\";" ^
  "docker build" ^
  "  --build-arg NEXT_PUBLIC_APP_NAME=$appName" ^
  "  --build-arg NEXT_PUBLIC_COMPANY_COLOR=$color" ^
  "  --build-arg NEXT_PUBLIC_DEEPGRAM_API_KEY=$deepgram" ^
  "  -t %IMAGE%:%TAG% .;" ^
  "if ($LASTEXITCODE -ne 0) { Write-Error 'Build failed'; exit 1 };" ^
  "Write-Host \"[build] Done: %IMAGE%:%TAG%\""

endlocal
