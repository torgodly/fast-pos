# Fast POS - Windows install (Node 22.13+ or 24, no reboot)
# Run as Administrator in PowerShell:
#   powershell -ExecutionPolicy Bypass -File C:\fast-pos\scripts\install-windows.ps1

$ErrorActionPreference = "Stop"
$Project = Split-Path $PSScriptRoot -Parent

$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($NodeCommand) {
  $NodeExe = $NodeCommand.Source
  $NodeDir = Split-Path $NodeExe -Parent
} else {
  $NodeDir = "C:\nodejs24"
  if (-not (Test-Path "$NodeDir\node.exe")) {
    $NodeDir = "C:\nodejs22"
  }
  $NodeExe = Join-Path $NodeDir "node.exe"
}

$NodeVersionText = & $NodeExe -p 'process.versions.node'
$NodeVersion = [version]$NodeVersionText
$SupportedNode = ($NodeVersion.Major -eq 22 -and $NodeVersion -ge [version]"22.13.0") -or $NodeVersion.Major -eq 24
if (-not $SupportedNode) {
  Write-Host "Unsupported Node.js version $NodeVersion. Use Node 22.13+ or Node 24."
  exit 1
}

$env:Path = "$NodeDir;" + ($env:Path -split ';' | Where-Object { $_ -ne $NodeDir }) -join ';'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "node: $NodeVersion - $NodeExe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"
if (-not (Test-Path $NpmCmd)) {
  Write-Host "Missing $NpmCmd - install npm with Node.js or use a standard Node.js distribution."
  exit 1
}

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
  Write-Host "WARNING: Cannot reach GitHub - npm may try to compile and need Python."
  Write-Host $_.Exception.Message
}

$env:npm_config_build_from_source = "false"
Write-Host "Running npm install (use npm.cmd to avoid PowerShell signing)..."
& $NpmCmd install
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "INSTALL FAILED."
  Write-Host "If better-sqlite3 needs to compile, install Python 3 and Visual Studio Build Tools (Desktop development with C++)."
  Write-Host "Then run this script again."
  exit $LASTEXITCODE
}

& $NpmCmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "SUCCESS."
Write-Host ('nssm set FastPOS Application "' + $NodeExe + '"')
Write-Host "nssm restart FastPOS"
