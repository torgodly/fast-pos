@echo off
title Fast POS - Restart Print Agent
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-agent.ps1"
echo.
echo Starting agent...
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0print-agent.ps1"
timeout /t 3 /nobreak >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9288/health' -UseBasicParsing -TimeoutSec 5; Write-Host '[OK]' $r.Content; exit 0 } catch { Write-Host '[FAIL]' $_.Exception.Message; exit 1 }"
pause
