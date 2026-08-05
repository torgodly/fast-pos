@echo off
title Fast POS - Stop Print Agent
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-agent.ps1"
pause
