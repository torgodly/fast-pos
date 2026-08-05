# Quick check — run on cashier PC after SETUP.bat
$ErrorActionPreference = "Continue"
Write-Host ""
Write-Host "Fast POS print agent check"
Write-Host "=========================="
Write-Host ""

try {
  $dp = Get-Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1
  if ($dp) {
    Write-Host "[OK] Default printer:" $dp.Name
  } else {
    Write-Host "[WARN] No default printer — set one in Windows Settings"
  }
} catch {
  Write-Host "[WARN] Could not list printers:" $_.Exception.Message
}

Write-Host ""
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:9288/health" -UseBasicParsing -TimeoutSec 3
  Write-Host "[OK] Agent health:" $r.Content
} catch {
  Write-Host "[FAIL] Agent not running — run SETUP.bat on THIS PC (cashier, not server)"
  Write-Host "       " $_.Exception.Message
}

Write-Host ""
Write-Host "Open cashier in Chrome ON THIS PC: http://192.168.1.122:3000"
Write-Host ""
