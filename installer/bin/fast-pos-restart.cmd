@echo off
"%~dp0..\FastPOS-service.exe" restart
if errorlevel 1 exit /b %errorlevel%
echo Fast POS service restarted.
exit /b 0
