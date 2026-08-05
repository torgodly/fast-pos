@echo off
cd /d %~dp0
set "NODE=C:\nodejs22\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" server.mjs
