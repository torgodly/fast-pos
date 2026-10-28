@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\remote\remote.ps1" %*
if errorlevel 1 pause
exit /b %errorlevel%
