param(
  [Parameter(Position = 0)]
  [string]$Command = "start"
)

$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $PSScriptRoot
$StateDir = Join-Path $env:LOCALAPPDATA "FastPOS"
$StateFile = Join-Path $StateDir "remote-tunnel.json"
$LocalUrl = "http://127.0.0.1:3000"

if (-not (Test-Path -LiteralPath $StateDir)) {
  New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class FastPosJob {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
  private static extern IntPtr CreateJobObject(IntPtr attributes, string name);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool SetInformationJobObject(
    IntPtr job, int infoClass, IntPtr info, uint infoLength);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);

  [StructLayout(LayoutKind.Sequential)]
  private struct BasicLimits {
    public long PerProcessUserTimeLimit;
    public long PerJobUserTimeLimit;
    public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize;
    public UIntPtr MaximumWorkingSetSize;
    public uint ActiveProcessLimit;
    public UIntPtr Affinity;
    public uint PriorityClass;
    public uint SchedulingClass;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct IoCounters {
    public ulong ReadOperationCount;
    public ulong WriteOperationCount;
    public ulong OtherOperationCount;
    public ulong ReadTransferCount;
    public ulong WriteTransferCount;
    public ulong OtherTransferCount;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct ExtendedLimits {
    public BasicLimits BasicLimitInformation;
    public IoCounters IoInfo;
    public UIntPtr ProcessMemoryLimit;
    public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed;
    public UIntPtr PeakJobMemoryUsed;
  }

  private const int ExtendedLimitInformation = 9;
  private const uint KillOnJobClose = 0x2000;

  public static IntPtr CreateKillOnCloseJob() {
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    if (job == IntPtr.Zero) return IntPtr.Zero;

    var limits = new ExtendedLimits();
    limits.BasicLimitInformation.LimitFlags = KillOnJobClose;

    int size = Marshal.SizeOf(typeof(ExtendedLimits));
    IntPtr buffer = Marshal.AllocHGlobal(size);
    try {
      Marshal.StructureToPtr(limits, buffer, false);
      if (!SetInformationJobObject(job, ExtendedLimitInformation, buffer, (uint)size)) {
        CloseHandle(job);
        return IntPtr.Zero;
      }
    } finally {
      Marshal.FreeHGlobal(buffer);
    }
    return job;
  }

  public static bool Assign(IntPtr job, IntPtr process) {
    return AssignProcessToJobObject(job, process);
  }

  public static void Close(IntPtr job) {
    if (job != IntPtr.Zero) CloseHandle(job);
  }
}
"@

function Test-AppListening {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $pending = $client.BeginConnect("127.0.0.1", 3000, $null, $null)
    $ready = $pending.AsyncWaitHandle.WaitOne(2000)
    $connected = $ready -and $client.Connected
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

function Find-Cloudflared {
  $candidates = @(
    (Join-Path $AppRoot "cloudflared\cloudflared.exe"),
    (Join-Path $AppRoot "..\build\downloads\cloudflared\cloudflared.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

function Get-RemoteState {
  if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
  try {
    return Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-CloudflaredProcess([int]$ProcessId) {
  if (-not $ProcessId) { return $false }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  return ($process -ne $null -and $process.ProcessName -like "cloudflared*")
}

function Stop-RemoteTunnel {
  $state = Get-RemoteState
  if ($state -and (Test-CloudflaredProcess ([int]$state.pid))) {
    Stop-Process -Id ([int]$state.pid) -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 300
    Write-Output "Remote access stopped."
  } else {
    Write-Output "Remote access is not running."
  }
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
}

function Read-TunnelUrl([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }

  # cloudflared keeps the log open for writing, so read with full sharing.
  $stream = $null
  try {
    $stream = [System.IO.File]::Open(
      $Path,
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::ReadWrite
    )
    $reader = New-Object System.IO.StreamReader($stream)
    $text = $reader.ReadToEnd()
    $reader.Dispose()
  } catch {
    return $null
  } finally {
    if ($stream) { $stream.Dispose() }
  }

  $match = [regex]::Match($text, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
  if ($match.Success) { return $match.Value }
  return $null
}

if ($Command -eq "stop") {
  Stop-RemoteTunnel
  exit 0
}

if (-not (Test-AppListening)) {
  Write-Output ""
  Write-Output "Fast POS is not responding on $LocalUrl."
  Write-Output "Start the service first:  fast-pos-start   (then run this again)"
  Write-Output ""
  exit 1
}

$cloudflared = Find-Cloudflared
if (-not $cloudflared) {
  Write-Output ""
  Write-Output "cloudflared.exe was not found."
  Write-Output "Reinstall Fast POS or place cloudflared.exe in the 'cloudflared' folder."
  Write-Output ""
  exit 1
}

# Free a tunnel left behind by a crashed or closed launcher.
$previous = Get-RemoteState
if ($previous -and (Test-CloudflaredProcess ([int]$previous.pid))) {
  Stop-Process -Id ([int]$previous.pid) -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}
Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue

Get-ChildItem -LiteralPath $StateDir -Filter "remote-*" -File -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

$log = Join-Path $StateDir ("remote-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

$job = [FastPosJob]::CreateKillOnCloseJob()
if ($job -eq [IntPtr]::Zero) {
  Write-Output "Could not create the cleanup job. Remote access was not started."
  exit 1
}

$process = $null
try {
  $process = Start-Process -FilePath $cloudflared `
    -ArgumentList @("tunnel", "--url", $LocalUrl, "--no-autoupdate", "--logfile", $log) `
    -WindowStyle Hidden `
    -PassThru

  if (-not [FastPosJob]::Assign($job, $process.Handle)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Write-Output "Could not attach the tunnel to this window. Remote access was not started."
    exit 1
  }

  $url = $null
  for ($i = 0; $i -lt 90; $i++) {
    $url = Read-TunnelUrl $log
    if ($url) { break }
    if ($process.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }

  if (-not $url) {
    Write-Output ""
    Write-Output "Could not get a remote URL from Cloudflare."
    if (Test-Path -LiteralPath $log) {
      Write-Output "Last log lines ($log):"
      try {
        Get-Content -LiteralPath $log -Tail 15 -ErrorAction Stop |
          ForEach-Object { Write-Output ("  " + $_) }
      } catch {
        Write-Output "  (log is still in use - open the file above for details)"
      }
    }
    Write-Output ""
    exit 1
  }

  $state = [ordered]@{
    pid       = $process.Id
    url       = $url
    startedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    log       = $log
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8

  try { Set-Clipboard -Value $url -ErrorAction Stop } catch { }

  Write-Output ""
  Write-Output "============================================================"
  Write-Output "  FAST POS - REMOTE ACCESS"
  Write-Output "============================================================"
  Write-Output ""
  Write-Output "  $url"
  Write-Output ""
  Write-Output "  The URL is copied to the clipboard. Send it to the owner."
  Write-Output "  It changes every time you run this file."
  Write-Output ""
  Write-Output "  Keep THIS window open. Closing it (or Ctrl+C)"
  Write-Output "  ends remote access immediately."
  Write-Output ""
  Write-Output "  If the window is lost:  fast-pos-remote stop"
  Write-Output "============================================================"
  Write-Output ""

  Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  [FastPosJob]::Close($job)

  $state = Get-RemoteState
  if ($state -and $process -and [int]$state.pid -eq $process.Id) {
    Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Output "Remote access ended."
exit 0
