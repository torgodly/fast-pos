# Stop Fast POS print agent and free port 9288
$Port = 9288
$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping old print agent..."

Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*print-agent.ps1*' } |
  ForEach-Object {
    Write-Host "  Stopping PowerShell PID $($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force
  }

Start-Sleep -Seconds 1

$pids = New-Object System.Collections.Generic.HashSet[int]
foreach ($line in (netstat -ano | Select-String ":$Port\s")) {
  if ($line -match 'LISTENING\s+(\d+)\s*$') {
    [void]$pids.Add([int]$Matches[1])
  }
}

foreach ($procId in $pids) {
  if ($procId -le 4) { continue }
  try {
    $proc = Get-Process -Id $procId -ErrorAction Stop
    Write-Host "  Stopping $($proc.ProcessName) PID $procId (port $Port)"
    Stop-Process -Id $procId -Force
  } catch { }
}

Start-Sleep -Seconds 2

$stillUsed = netstat -ano | Select-String ":$Port\s+.*LISTENING"
if ($stillUsed) {
  Write-Host "[WARN] Port $Port still in use:"
  $stillUsed | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "[OK] Port $Port is free"
exit 0
