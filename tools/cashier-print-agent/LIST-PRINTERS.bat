@echo off
title Fast POS - List Windows Printers
cd /d "%~dp0"
echo.
echo  Installed printers on this PC:
echo  ==============================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "function Show-Default { $d = $null; try { $d = (Get-CimInstance Win32_Printer -Filter \"Default='True'\" ^| Select-Object -First 1).Name } catch {}; if (-not $d) { try { Add-Type -AssemblyName System.Drawing; $d = (New-Object System.Drawing.Printing.PrinterSettings).PrinterName } catch {} }; if ($d) { Write-Host '[DEFAULT]' $d } else { Write-Host '[DEFAULT] not detected' }; Write-Host ''; Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue ^| ForEach-Object { Write-Host ' -' $_.Name }; if (-not $?) { Get-Printer -ErrorAction SilentlyContinue ^| ForEach-Object { Write-Host ' -' $_.Name } }"
echo.
echo  If default is wrong, copy printer.txt.example to printer.txt
echo  and put the EXACT printer name on the first line.
echo.
pause
