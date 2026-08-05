@echo off
setlocal
title Fast POS - Print Agent Check
cd /d "%~dp0"

echo.
echo  Fast POS print agent check
echo  ==========================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $dp = Get-Printer ^| Where-Object { $_.Default -eq $true } ^| Select-Object -First 1; if ($dp) { Write-Host '[OK] Default printer:' $dp.Name } else { Write-Host '[WARN] No default printer in Windows' } } catch { Write-Host '[WARN] Could not list printers' }"

echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9288/health' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK] Agent health:' $r.Content; exit 0 } catch { Write-Host '[FAIL] Agent not running on this PC'; Write-Host '       ' $_.Exception.Message; if (Test-Path '%~dp0print-agent.log') { Write-Host ''; Write-Host '--- print-agent.log (last lines) ---'; Get-Content '%~dp0print-agent.log' -Tail 5 }; exit 1 }"

if errorlevel 1 (
  echo.
  echo  Fix: run SETUP.bat again on THIS PC ^(cashier PC with USB^).
  echo  Debug: run START-DEBUG.bat to see errors in a window.
) else (
  echo.
  echo  Good. Open cashier in Chrome on THIS PC:
  echo  http://192.168.1.122:3000
)

echo.
pause
