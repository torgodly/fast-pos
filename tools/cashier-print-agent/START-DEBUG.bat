@echo off
title Fast POS - Print Agent (debug window)
cd /d "%~dp0"
echo Running print agent - leave this window open.
echo Errors will show here. Log: print-agent.log
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0print-agent.ps1"
echo.
echo Agent stopped.
pause
