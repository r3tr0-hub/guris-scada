@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Push-GitHub.ps1"
set "SCADA_GITHUB_RESULT=%ERRORLEVEL%"
if not "%SCADA_GITHUB_RESULT%"=="0" (
  echo.
  echo Upload did not finish. See the message above and docs\GITHUB_SETUP_RU.md.
)
pause
exit /b %SCADA_GITHUB_RESULT%
