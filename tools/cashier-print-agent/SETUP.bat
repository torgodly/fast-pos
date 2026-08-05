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
echo  Step 2: Adding auto-start...
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

REM Stop any old hidden agent on port 9288 (same script only)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" ^| Where-Object { $_.CommandLine -like '*print-agent.ps1*' } ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" 2>nul

start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%AGENT%"

echo  Waiting for agent to start...
timeout /t 3 /nobreak >nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9288/health' -UseBasicParsing -TimeoutSec 5; Write-Host '  [OK] Agent health:' $r.Content; exit 0 } catch { Write-Host '  [FAIL] Agent did not start.'; Write-Host '         ' $_.Exception.Message; if (Test-Path '%~dp0print-agent.log') { Get-Content '%~dp0print-agent.log' -Tail 3 }; exit 1 }"

if errorlevel 1 (
  echo.
  echo  SETUP did NOT finish OK. Run START-DEBUG.bat and read the error.
  echo  Common fixes:
  echo    - Set USB printer as Default in Windows
  echo    - Close other program using port 9288
  echo    - Run START-DEBUG.bat on this PC
  pause
  exit /b 1
)

echo.
echo  [OK] Print agent is running on this PC.
echo  Open cashier in Chrome ON THIS PC: http://192.168.1.122:3000
echo  Then pick your USB station and click test print.
echo.
pause
