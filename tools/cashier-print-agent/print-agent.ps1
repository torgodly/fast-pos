# Fast POS USB print agent - PowerShell only, no Node, no admin URL ACL
# Listens on http://127.0.0.1:9288

$Port = 9288
$ErrorActionPreference = "Stop"
$LogPath = Join-Path $PSScriptRoot "print-agent.log"

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  try {
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
  } catch { }
}

function Get-DefaultPrinterName {
  try {
    $p = Get-Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1
    if ($p) { return [string]$p.Name }
  } catch { }
  return $null
}

function Send-RawPrint([byte[]]$Bytes, [string]$PrinterName) {
  if (-not $PrinterName) { throw "No printer name" }

  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
  }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFOW pDocInfo);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
"@ -ErrorAction SilentlyContinue

  $h = [IntPtr]::Zero
  if (-not [RawPrinterHelper]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
    throw "Cannot open printer: $PrinterName"
  }
  try {
    $doc = New-Object RawPrinterHelper+DOCINFOW
    $doc.pDocName = "FastPOS"
    $doc.pDatatype = "RAW"
    if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, [ref]$doc)) {
      throw "StartDoc failed"
    }
    try {
      [void][RawPrinterHelper]::StartPagePrinter($h)
      $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($Bytes.Length)
      [Runtime.InteropServices.Marshal]::Copy($Bytes, 0, $ptr, $Bytes.Length)
      $written = 0
      if (-not [RawPrinterHelper]::WritePrinter($h, $ptr, $Bytes.Length, [ref]$written)) {
        throw "Write failed"
      }
      [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
      [void][RawPrinterHelper]::EndPagePrinter($h)
    } finally {
      [void][RawPrinterHelper]::EndDocPrinter($h)
    }
  } finally {
    [void][RawPrinterHelper]::ClosePrinter($h)
  }
}

function Send-HttpResponse($Stream, [int]$Code, [string]$Json) {
  $body = [System.Text.Encoding]::UTF8.GetBytes($Json)
  $status = switch ($Code) { 200 { "OK" } 204 { "No Content" } default { "Error" } }
  $header = "HTTP/1.1 $Code $status`r`n" +
    "Content-Type: application/json; charset=utf-8`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
    "Access-Control-Allow-Headers: Content-Type`r`n" +
    "Access-Control-Allow-Private-Network: true`r`n" +
    "Content-Length: $($body.Length)`r`n" +
    "Connection: close`r`n`r`n"
  $hdr = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($hdr, 0, $hdr.Length)
  if ($body.Length -gt 0) {
    $Stream.Write($body, 0, $body.Length)
  }
  $Stream.Flush()
}

function Read-RequestBody($Stream, [int]$ContentLength) {
  if ($ContentLength -le 0) { return "" }
  $buffer = New-Object byte[] $ContentLength
  $read = 0
  while ($read -lt $ContentLength) {
    $n = $Stream.Read($buffer, $read, $ContentLength - $read)
    if ($n -le 0) { break }
    $read += $n
  }
  return [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
}

function Handle-Client($Client) {
  try {
    $stream = $Client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { return }

    $parts = $requestLine.Split(" ")
    $method = $parts[0]
    $path = if ($parts.Length -gt 1) { ($parts[1] -split "\?")[0] } else { "/" }

    $contentLength = 0
    while ($true) {
      $line = $reader.ReadLine()
      if ([string]::IsNullOrEmpty($line)) { break }
      if ($line -match "^(?i)Content-Length:\s*(\d+)") {
        $contentLength = [int]$Matches[1]
      }
    }

    if ($method -eq "OPTIONS") {
      Send-HttpResponse $stream 204 "{}"
      return
    }

    if ($method -eq "GET" -and $path -eq "/health") {
      $dp = Get-DefaultPrinterName
      $json = (@{ ok = $true; printer = $dp } | ConvertTo-Json -Compress)
      Send-HttpResponse $stream 200 $json
      return
    }

    if ($method -eq "POST" -and $path -eq "/print") {
      $rawBody = Read-RequestBody $stream $contentLength
      try {
        $payload = $rawBody | ConvertFrom-Json
        $b64 = [string]$payload.data
        if (-not $b64) { throw "Missing data" }
        $name = [string]$payload.printerName
        if (-not $name -or $name -eq "default") {
          $name = Get-DefaultPrinterName
        }
        if (-not $name) { throw "Set a default printer in Windows" }
        $bytes = [Convert]::FromBase64String($b64)
        Send-RawPrint $bytes $name
        Write-Log "Printed $($bytes.Length) bytes to $name"
        $json = (@{ ok = $true; printer = $name; bytes = $bytes.Length } | ConvertTo-Json -Compress)
        Send-HttpResponse $stream 200 $json
      } catch {
        $msg = $_.Exception.Message -replace '"', "'"
        Write-Log "Print error: $msg"
        Send-HttpResponse $stream 500 "{ `"error`": `"$msg`" }"
      }
      return
    }

    Send-HttpResponse $stream 404 "{ `"error`": `"Not found`" }"
  } catch {
    Write-Log "Client error: $($_.Exception.Message)"
  } finally {
    try { $Client.Close() } catch { }
  }
}

try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  $listener.Start()
} catch {
  Write-Log "Failed to start on port ${Port}: $($_.Exception.Message)"
  Write-Host "ERROR: Cannot listen on port $Port - $($_.Exception.Message)"
  exit 1
}

$dp = Get-DefaultPrinterName
Write-Log "Agent started on port $Port, printer=$dp"
Write-Host "Fast POS Print Agent - port $Port"
Write-Host "Printer: $(if ($dp) { $dp } else { 'SET DEFAULT IN WINDOWS' })"
Write-Host "Log: $LogPath"

while ($true) {
  $client = $listener.AcceptTcpClient()
  Handle-Client $client
}
