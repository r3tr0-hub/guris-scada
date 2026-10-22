@echo off
setlocal
cd /d "%~dp0"
where zig >nul 2>nul
if errorlevel 1 (
  echo Install Zig 0.13 and add zig.exe to PATH.
  exit /b 1
)
set "SCADA_SQLITE_OBJECT=%TEMP%\GurisSCADA_SQLite_%RANDOM%.o"
zig cc -target x86_64-windows-gnu -std=c11 -O2 -Wall -Wextra -Wno-unused-parameter -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_DQS=0 -DSQLITE_DEFAULT_MEMSTATUS=0 -c vendor/sqlite/sqlite3.c -o "%SCADA_SQLITE_OBJECT%"
if errorlevel 1 exit /b 1
zig cc -target x86_64-windows-gnu -std=c11 -O2 -Wall -Wextra -s -municode -Wl,--subsystem,windows src/main.c "%SCADA_SQLITE_OBJECT%" -o GurisSCADA_0_1.exe -lws2_32 -lshell32 -luser32 -lbcrypt
set "SCADA_BUILD_RESULT=%ERRORLEVEL%"
del /q "%SCADA_SQLITE_OBJECT%" >nul 2>nul
if not "%SCADA_BUILD_RESULT%"=="0" exit /b %SCADA_BUILD_RESULT%
echo Built GurisSCADA_0_1.exe
