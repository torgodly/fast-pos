@echo off
setlocal
set "SVC=%~dp0..\FastPOS-service.exe"
sc query FastPOS >nul 2>&1
if not errorlevel 1 (
  "%SVC%" stop
  "%SVC%" uninstall
  ping -n 3 127.0.0.1 >nul
)
"%SVC%" install
if errorlevel 1 exit /b %errorlevel%
"%SVC%" start
exit /b %errorlevel%
