$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$requirements = Join-Path $repoRoot "desktop\license-generator\requirements.txt"
$entryPoint = Join-Path $repoRoot "desktop\license-generator\license_generator.py"
$distPath = Join-Path $repoRoot "release\license-generator"
$workPath = Join-Path $repoRoot "build\license-generator"
$embeddedKeyPath = Join-Path $workPath "embedded-license-key.json"

Set-Location $repoRoot
Get-Command python -ErrorAction Stop | Out-Null

& python -c "import cryptography, PyInstaller"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing GUI packaging dependencies..."
  & python -m pip install -r $requirements
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to install license GUI build dependencies."
  }
}

New-Item -ItemType Directory -Force -Path $distPath, $workPath | Out-Null

$passphraseSecure = Read-Host "Set a passphrase for the encrypted key embedded in this EXE (12+ characters)" -AsSecureString
$confirmationSecure = Read-Host "Confirm the key passphrase" -AsSecureString
$passphrasePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passphraseSecure)
$confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmationSecure)
try {
  $passphrase = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passphrasePointer)
  $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
  if ($passphrase.Length -lt 12) {
    throw "Use a passphrase of at least 12 characters."
  }
  if ($passphrase -cne $confirmation) {
    throw "The passphrases do not match."
  }

  $env:LICENSE_KEY_PASSPHRASE = $passphrase
  & python (Join-Path $repoRoot "desktop\license-generator\embed_license_key.py") $embeddedKeyPath
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to encrypt the selected private key. Confirm key paths in the GUI settings."
  }

  & python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --name "Fast-POS-License-Generator" `
    --collect-binaries cryptography `
    --add-data "$embeddedKeyPath;." `
    --distpath $distPath `
    --workpath $workPath `
    --specpath $workPath `
    $entryPoint
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build the standalone Windows license generator."
  }
} finally {
  Remove-Item Env:\LICENSE_KEY_PASSPHRASE -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passphrasePointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer)
  $passphrase = $null
  $confirmation = $null
  $passphraseSecure.Dispose()
  $confirmationSecure.Dispose()
  if (Test-Path -LiteralPath $embeddedKeyPath) {
    Remove-Item -LiteralPath $embeddedKeyPath -Force
  }
}

Write-Host "Created $distPath\Fast-POS-License-Generator.exe"
