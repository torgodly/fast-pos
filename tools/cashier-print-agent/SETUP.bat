@echo off
title Fast POS - Cashier Printer Setup
cd /d %~dp0

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

(
echo Set shell = CreateObject("WScript.Shell"^)
echo shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""%~dp0print-agent.ps1""", 0, False
) > "%VBS%"

echo  [OK] Will start automatically when Windows starts.
echo.

start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0print-agent.ps1"

timeout /t 2 /nobreak >nul
echo  [OK] Print agent is running now.
echo.
echo  Open cashier on THIS PC: http://192.168.1.122:3000
echo.
pause
