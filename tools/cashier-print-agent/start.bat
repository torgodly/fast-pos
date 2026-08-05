@echo off
cd /d %~dp0
if not exist config.json (
  copy config.example.json config.json
  echo.
  echo Edit config.json — set printerName to your Windows printer name.
  echo Open Settings ^> Printers to see the exact name.
  echo.
  pause
)
node server.mjs
