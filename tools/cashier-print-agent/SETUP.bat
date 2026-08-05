@echo off
title Fast POS - Cashier Printer Setup
cd /d %~dp0

set "NODE=C:\nodejs22\node.exe"
if not exist "%NODE%" set "NODE=node"

echo.
echo  ============================================================
echo   FAST POS - USB CASHIER PRINTER SETUP
echo  ============================================================
echo.
echo   RUN THIS ON THE CASHIER PC  (where USB printer is plugged)
echo   NOT on the main server!
echo.
echo   Server = 192.168.1.122  (iPads connect here)
echo   Cashier PC = the Windows desk PC with the USB cable
echo.
echo  ============================================================
echo.
set /p OK="Is THIS computer the cashier PC with USB printer? (Y/N): "
if /I not "%OK%"=="Y" (
  echo.
  echo  Copy this whole folder to the CASHIER PC, then run SETUP.bat there:
  echo    tools\cashier-print-agent
  echo.
  pause
  exit /b 1
)

echo.
echo  Uses your DEFAULT Windows printer. No config needed.
echo.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\FastPOS-Print.vbs"

(
echo Set shell = CreateObject("WScript.Shell"^)
echo shell.Run "cmd /c cd /d ""%~dp0"" ^&^& ""%NODE%"" server.mjs", 0, False
) > "%VBS%"

echo  [OK] Auto-start added - runs when THIS PC starts
echo.

start "" /B "%NODE%" server.mjs

timeout /t 2 /nobreak >nul
echo  [OK] Print agent running on THIS PC only
echo.
echo  Next:
echo    1. Set receipt printer as DEFAULT in Windows ^(on this PC^)
echo    2. Admin: add USB cashier printer, leave IP empty
echo    3. Open cashier in browser ON THIS PC ^(not iPad^)
echo.
pause
