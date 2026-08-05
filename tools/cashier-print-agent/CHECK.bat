@echo off
title Fast POS - Print Agent Check
cd /d %~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-agent.ps1"
pause
