@echo off
"%~dp0..\FastPOS-service.exe" stop
if errorlevel 1 exit /b %errorlevel%
echo Fast POS service stopped.
exit /b 0
