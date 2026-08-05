@echo off
title Fast POS - Cashier Printer Setup
cd /d %~dp0

set "NODE=C:\nodejs22\node.exe"
if not exist "%NODE%" set "NODE=node"

echo.
echo  ========================================
echo   Fast POS - USB Cashier Printer Setup
echo  ========================================
echo.
echo  Uses your DEFAULT Windows printer.
echo  No config file needed!
echo.

REM Run hidden on every Windows login
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\FastPOS-Print.vbs"

(
echo Set shell = CreateObject("WScript.Shell"^)
echo shell.Run "cmd /c cd /d ""%~dp0"" ^&^& ""%NODE%"" server.mjs", 0, False
) > "%VBS%"

echo  [OK] Auto-start added to Windows Startup
echo.

REM Start now in background
start "" /B "%NODE%" server.mjs

timeout /t 2 /nobreak >nul
echo  [OK] Print agent is running now
echo.
echo  Next steps:
echo    1. In Windows: set your receipt printer as DEFAULT
echo    2. In Admin: add printer - USB - leave name blank
echo    3. Open cashier on THIS PC and test print
echo.
pause
