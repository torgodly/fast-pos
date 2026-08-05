# Fast POS — Windows install (Node 22 portable, no reboot)
# Run as Administrator in PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\fast-pos\scripts\install-windows.ps1

$ErrorActionPreference = "Stop"
$NodeDir = "C:\nodejs22"
$Project = Split-Path $PSScriptRoot -Parent

if (-not (Test-Path "$NodeDir\node.exe")) {
  Write-Host "Missing $NodeDir\node.exe — extract node-v22-win-x64.zip there first."
  exit 1
}

# Node 22 first (not Program Files\nodejs v26)
$env:Path = "$NodeDir;" + ($env:Path -split ';' | Where-Object { $_ -notmatch 'Program Files\\nodejs' }) -join ';'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "node: $(node -v) — $(Get-Command node | Select-Object -ExpandProperty Source)"

# Stop service so sharp/sqlite files are not locked (EBUSY)
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if ($nssm) {
  Write-Host "Stopping FastPOS service..."
  & nssm stop FastPOS 2>$null
  Start-Sleep -Seconds 3
}

Set-Location $Project

if (Test-Path node_modules) {
  Write-Host "Removing node_modules..."
  Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

Write-Host "Testing GitHub (prebuilt better-sqlite3 downloads from here)..."
try {
  Invoke-WebRequest -Uri "https://github.com" -UseBasicParsing -TimeoutSec 15 | Out-Null
  Write-Host "GitHub OK"
} catch {
  Write-Host "WARNING: Cannot reach GitHub — npm may try to compile and need Python."
  Write-Host $_.Exception.Message
}

$env:npm_config_build_from_source = "false"
Write-Host "Running npm install (use npm.cmd to avoid PowerShell signing)..."
& "$NodeDir\npm.cmd" install
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "INSTALL FAILED."
  Write-Host "If log says 'find Python': install Python 3.12 (Add to PATH) OR fix GitHub access."
  Write-Host "Then run this script again."
  exit $LASTEXITCODE
}

& "$NodeDir\npm.cmd" run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "SUCCESS."
Write-Host 'nssm set FastPOS Application "C:\nodejs22\node.exe"'
Write-Host "nssm restart FastPOS"
