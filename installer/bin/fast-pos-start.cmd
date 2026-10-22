@echo off
"%~dp0..\FastPOS-service.exe" start
if errorlevel 1 exit /b %errorlevel%
echo Fast POS service started.
exit /b 0
