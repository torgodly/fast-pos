@echo off
setlocal
title Fast POS - Cashier Printer Setup
cd /d "%~dp0"

echo.
echo  ===================================================
echo   FAST POS - Cashier USB Printer
echo   NO Node.js needed - PowerShell only
echo  ===================================================
echo.
echo   Run on the CASHIER PC (USB printer), NOT the server.
echo.
set /p OK="Is this the cashier PC with USB printer? (Y/N): "
if /I not "%OK%"=="Y" (
  echo.
  echo  Copy this folder to the cashier PC and run SETUP.bat there.
  pause
  exit /b 1
)

echo.
echo  Step 1: Set receipt printer as DEFAULT in Windows Settings
echo  Step 2: Free port 9288 and start agent...
echo.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS=%STARTUP%\FastPOS-Print.vbs"
set "AGENT=%~dp0print-agent.ps1"

(
echo Set shell = CreateObject("WScript.Shell"^)
echo shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%AGENT%""", 0, False
) > "%VBS%"

echo  [OK] Will start automatically when Windows starts.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-agent.ps1"
if errorlevel 1 (
  echo.
  echo  Could not free port 9288 automatically.
  echo  Run STOP.bat as Administrator, or restart this PC, then SETUP again.
  pause
  exit /b 1
)

start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%AGENT%"

echo  Waiting for agent to start...
set RETRIES=0

:CHECK_LOOP
timeout /t 2 /nobreak >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9288/health' -UseBasicParsing -TimeoutSec 5; Write-Host '  [OK] Agent health:' $r.Content; exit 0 } catch { exit 1 }"
if not errorlevel 1 goto SETUP_OK

set /a RETRIES+=1
if %RETRIES% LSS 5 goto CHECK_LOOP

echo  [FAIL] Agent did not start.
if exist "%~dp0print-agent.log" (
  echo.
  echo  --- print-agent.log (last lines) ---
  powershell.exe -NoProfile -Command "Get-Content '%~dp0print-agent.log' -Tail 5"
)
echo.
echo  Run START-DEBUG.bat on this PC to see the error in a window.
pause
exit /b 1

:SETUP_OK
echo.
echo  [OK] Print agent is running on this PC.
echo  Run CHECK.bat anytime to verify.
echo  Open cashier in Chrome ON THIS PC: http://192.168.1.122:3000
echo.
pause
