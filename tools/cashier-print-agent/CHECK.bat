@echo off
setlocal
title Fast POS - Print Agent Check
cd /d "%~dp0"

echo.
echo  Fast POS print agent check
echo  ==========================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "function Get-DefaultName { try { $p = Get-CimInstance Win32_Printer -Filter \"Default='True'\" ^| Select-Object -First 1; if ($p) { return [string]$p.Name } } catch {}; try { Add-Type -AssemblyName System.Drawing; return (New-Object System.Drawing.Printing.PrinterSettings).PrinterName } catch {}; try { $d = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows').Device; if ($d) { return ($d -split ',')[0] } } catch {}; return $null }; if (Test-Path '%~dp0printer.txt') { $n = (Get-Content '%~dp0printer.txt' -Raw).Trim(); if ($n) { Write-Host '[OK] printer.txt:' $n; exit 0 } }; $dp = Get-DefaultName; if ($dp) { Write-Host '[OK] Default printer:' $dp } else { Write-Host '[WARN] Default not detected - run LIST-PRINTERS.bat' }"

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
