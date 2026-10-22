@echo off
setlocal
set "URL=http://localhost:3000"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u = '%URL%'; for ($i = 0; $i -lt 120; $i++) { try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 3000); $c.Close(); Start-Process $u; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; Start-Process $u"
