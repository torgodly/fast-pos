@echo off
setlocal
set "APP=%~dp0.."
for /f "usebackq tokens=1,* delims==" %%A in ("%APP%\fast-pos.env") do set "%%A=%%B"
cd /d "%APP%\server"
"%APP%\node\node.exe" server.js
