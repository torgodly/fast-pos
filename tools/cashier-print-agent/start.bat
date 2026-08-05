@echo off
title Fast POS - Cashier Printer
cd /d %~dp0

echo.
echo  Run on CASHIER PC (USB printer plugged in) — NOT the server
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-agent.ps1"
pause
