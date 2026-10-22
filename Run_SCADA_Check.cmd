@echo off
setlocal
title Guris SCADA - dependency diagnostics
set "SCADA_CHECK_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe" set "SCADA_CHECK_PS=%SystemRoot%\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
set "SCADA_CHECK_DIR=%~dp0."
if not "%~1"=="" set "SCADA_CHECK_DIR=%~f1\."
echo Guris SCADA 0.1 dependency diagnostics
echo This does not start SCADA, install software or send PLC commands.
echo.
if not exist "%SCADA_CHECK_PS%" goto fallback
if not exist "%~dp0Check_SCADA.ps1" goto fallback
"%SCADA_CHECK_PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Check_SCADA.ps1" -AppDir "%SCADA_CHECK_DIR%"
if errorlevel 1 goto fallback
echo.
echo Completed. Send the SCADA_Diagnostics_*.txt report shown above.
goto done

:fallback
echo PowerShell diagnostics could not run. Creating a limited CMD report.
set "SCADA_CHECK_REPORT=%TEMP%\SCADA_Diagnostics_Fallback_%RANDOM%_%RANDOM%.txt"
>"%SCADA_CHECK_REPORT%" echo Guris SCADA - limited CMD diagnostics
if not exist "%SCADA_CHECK_REPORT%" goto report_failed
>>"%SCADA_CHECK_REPORT%" echo Date: %DATE% %TIME%
>>"%SCADA_CHECK_REPORT%" echo Application directory: "%SCADA_CHECK_DIR%"
>>"%SCADA_CHECK_REPORT%" echo PROCESSOR_ARCHITECTURE=%PROCESSOR_ARCHITECTURE%
>>"%SCADA_CHECK_REPORT%" echo PROCESSOR_ARCHITEW6432=%PROCESSOR_ARCHITEW6432%
>>"%SCADA_CHECK_REPORT%" ver
>>"%SCADA_CHECK_REPORT%" "%SystemRoot%\System32\reg.exe" query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion" /v ProductName 2>&1
>>"%SCADA_CHECK_REPORT%" "%SystemRoot%\System32\reg.exe" query "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion" /v CurrentBuildNumber 2>&1
>>"%SCADA_CHECK_REPORT%" echo --- Files ---
>>"%SCADA_CHECK_REPORT%" dir /a:-d "%SCADA_CHECK_DIR%\GurisSCADA_0_1.exe" 2>&1
>>"%SCADA_CHECK_REPORT%" dir /a:-d "%SCADA_CHECK_DIR%\ui\index.html" "%SCADA_CHECK_DIR%\ui\app.js" "%SCADA_CHECK_DIR%\ui\style.css" 2>&1
>>"%SCADA_CHECK_REPORT%" echo --- Edge ---
>>"%SCADA_CHECK_REPORT%" dir /a:-d "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" 2>&1
>>"%SCADA_CHECK_REPORT%" dir /a:-d "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" 2>&1
>>"%SCADA_CHECK_REPORT%" dir /a:-d "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" 2>&1
>>"%SCADA_CHECK_REPORT%" echo --- Application Error events, latest 10 ---
>>"%SCADA_CHECK_REPORT%" "%SystemRoot%\System32\wevtutil.exe" qe Application /q:"*[System[Provider[@Name='Application Error']]]" /rd:true /c:10 /f:text 2>&1
echo Report saved: "%SCADA_CHECK_REPORT%"
echo If there was a PowerShell error above, include its text or a photo too.

goto done

:report_failed
echo Cannot create report in TEMP. Copy the scripts to a writable folder.

:done
echo.
pause
endlocal
