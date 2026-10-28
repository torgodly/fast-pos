# Fast POS — build the Windows installer (Inno Setup 6 or newer)
# Usage (from repo root):
#   npm run installer:build
#   powershell -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -ISCCPath "C:\Program Files\Inno Setup 7\ISCC.exe"
# Optional:
#   -NodeDir   path to an extracted portable Node.js win-x64 folder (containing node.exe)
#   -NodeVersion  Node.js version to download when -NodeDir is omitted (default 24.11.0)
#   -SkipNpm   reuse an existing .next build (skips npm ci / npm run build)

param(
  [string]$ISCCPath = "",
  [string]$NodeDir = "",
  [string]$NodeVersion = "24.11.0",
  [switch]$SkipNpm
)

$ErrorActionPreference = "Stop"
$Project = Split-Path $PSScriptRoot -Parent
$Payload = Join-Path $Project "build\installer-payload"
$Downloads = Join-Path $Project "build\downloads"
$Version = (Get-Content (Join-Path $Project "package.json") -Raw | ConvertFrom-Json).version

function Fail([string]$Message) {
  Write-Host ""
  Write-Host "INSTALLER BUILD FAILED: $Message" -ForegroundColor Red
  exit 1
}

function Resolve-ISCC {
  param([string]$Explicit)
  if ($Explicit) {
    if (Test-Path $Explicit) { return (Resolve-Path $Explicit).Path }
    Fail "ISCC.exe not found at: $Explicit"
  }
  $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @(
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 5\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 5\ISCC.exe"
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  Fail "Inno Setup compiler (ISCC.exe) not found. Install Inno Setup 6 or newer from https://jrsoftware.org/isinfo.php or pass -ISCCPath. / لم يتم العثور على برنامج Inno Setup."
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Get-ChildItem -Path $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
}

$iscc = Resolve-ISCC $ISCCPath
Write-Host "Inno Setup: $iscc"
Write-Host "Version:    $Version"

# 1) Build the app (prebuild refreshes data/license-public.pem and wipes .next)
Push-Location $Project
try {
  if (-not $SkipNpm) {
    Write-Host "== npm ci =="
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { Fail "npm ci failed (exit $LASTEXITCODE)" }

    Write-Host "== npm run build =="
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { Fail "npm run build failed (exit $LASTEXITCODE)" }
  }

  $standalone = Join-Path $Project ".next\standalone"
  if (-not (Test-Path (Join-Path $standalone "server.js"))) {
    Fail "Missing .next\standalone\server.js — is output: 'standalone' enabled in next.config.ts?"
  }

  # 2) Assemble payload
  if (Test-Path $Payload) { Remove-Item -Recurse -Force $Payload }
  New-Item -ItemType Directory -Force -Path $Payload | Out-Null
  $serverDir = Join-Path $Payload "server"
  Copy-DirectoryContents $standalone $serverDir

  # Loaded at runtime by Skia, not traced via require() — missing it crashes on Arabic text.
  $icuData = Join-Path $serverDir "node_modules\@napi-rs\canvas-win32-x64-msvc\icudtl.dat"
  if (-not (Test-Path $icuData)) {
    Fail "Missing @napi-rs/canvas ICU data (icudtl.dat) in the standalone build; Arabic receipt printing would crash the server. Check outputFileTracingIncludes in next.config.ts."
  }

  $staticSource = Join-Path $Project ".next\static"
  $staticDestination = Join-Path $serverDir ".next\static"
  Copy-DirectoryContents $staticSource $staticDestination

  $publicSource = Join-Path $Project "public"
  if (Test-Path $publicSource) {
    Copy-DirectoryContents $publicSource (Join-Path $serverDir "public")
  }

  $dataDir = Join-Path $serverDir "data"
  # Never ship runtime data (dev pos.db, WAL/SHM) — tracing can pick it up.
  if (Test-Path $dataDir) { Remove-Item -Recurse -Force $dataDir }
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  $publicKey = Join-Path $Project "data\license-public.pem"
  if (-not (Test-Path $publicKey)) {
    Fail "Missing data\license-public.pem. Configure the license public key before building the installer (see scripts/prepare-activation-key.mjs)."
  }
  Copy-Item $publicKey (Join-Path $dataDir "license-public.pem") -Force

  # 3) Portable Node.js runtime
  $nodeTarget = Join-Path $Payload "node"
  if ($NodeDir) {
    if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
      Fail "-NodeDir must contain node.exe: $NodeDir"
    }
    Copy-DirectoryContents $NodeDir $nodeTarget
  } else {
    New-Item -ItemType Directory -Force -Path $Downloads | Out-Null
    $zipName = "node-v$NodeVersion-win-x64.zip"
    $zipPath = Join-Path $Downloads $zipName
    if (-not (Test-Path $zipPath)) {
      $url = "https://nodejs.org/dist/v$NodeVersion/$zipName"
      Write-Host "Downloading portable Node.js: $url"
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    }
    $extracted = Join-Path $Downloads "node-v$NodeVersion-win-x64"
    if (-not (Test-Path (Join-Path $extracted "node.exe"))) {
      if (Test-Path $extracted) { Remove-Item -Recurse -Force $extracted }
      Expand-Archive -Path $zipPath -DestinationPath $Downloads -Force
    }
    Copy-DirectoryContents $extracted $nodeTarget
  }

  # 4) Launchers, remote tunnel, service wrapper, env
  Copy-DirectoryContents (Join-Path $Project "installer\bin") (Join-Path $Payload "bin")
  Copy-Item (Join-Path $Project "installer\README-FIRST.txt") (Join-Path $Payload "README-FIRST.txt") -Force

  Copy-DirectoryContents (Join-Path $Project "installer\remote") (Join-Path $Payload "remote")

  $cloudflaredSource = Join-Path $Downloads "cloudflared\cloudflared.exe"
  if (-not (Test-Path $cloudflaredSource)) {
    Fail "Missing $cloudflaredSource — download cloudflared.exe there before building (remote access needs it)."
  }
  $cloudflaredSha256 = "83E726ED18EA78C5AD5213C4C3A3A27051393950D2BC8ED4DE69BEC12D14EAAE"
  $actualHash = (Get-FileHash $cloudflaredSource -Algorithm SHA256).Hash
  if ($actualHash -ne $cloudflaredSha256) {
    Fail "cloudflared.exe checksum mismatch. Expected $cloudflaredSha256, got $actualHash. Update the expected hash only after verifying the new binary."
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $Payload "cloudflared") | Out-Null
  Copy-Item $cloudflaredSource (Join-Path $Payload "cloudflared\cloudflared.exe") -Force

  $sessionSecret = [Convert]::ToBase64String(
    (1..32 | ForEach-Object { Get-Random -Maximum 256 })
  )
  $serviceExe = Join-Path $Payload "FastPOS-service.exe"
  Copy-Item (Join-Path $Project "installer\vendor\winsw\FastPOS-service.exe") $serviceExe -Force
  $serviceXmlTemplate = Get-Content (Join-Path $Project "installer\service\FastPOS-service.xml") -Raw
  $serviceXml = $serviceXmlTemplate.Replace("__SESSION_SECRET__", $sessionSecret)
  Set-Content -Path (Join-Path $Payload "FastPOS-service.xml") -Value $serviceXml -Encoding UTF8

  $envLines = @(
    "NODE_ENV=production",
    "PORT=3000",
    "HOSTNAME=0.0.0.0",
    "SESSION_SECRET=$sessionSecret"
  )
  Set-Content -Path (Join-Path $Payload "fast-pos.env") -Value $envLines -Encoding ASCII

  # 5) Compile the installer
  $iss = Join-Path $Project "installer\fast-pos.iss"
  Write-Host "== ISCC =="
  & $iscc "/DPayloadRoot=$Payload" "/DAppVersion=$Version" $iss
  if ($LASTEXITCODE -ne 0) { Fail "ISCC failed (exit $LASTEXITCODE)" }

  $output = Join-Path $Project "release\installer\Fast-POS-Setup-$Version.exe"
  if (-not (Test-Path $output)) { Fail "Expected installer not found: $output" }
  Write-Host ""
  Write-Host "SUCCESS: $output" -ForegroundColor Green
}
finally {
  Pop-Location
}
