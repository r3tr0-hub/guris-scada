@echo off
setlocal
cd /d "%~dp0"
py tools\build_windows.py
exit /b %ERRORLEVEL%
