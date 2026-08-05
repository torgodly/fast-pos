# Fast POS USB print agent - PowerShell only, no Node, no admin URL ACL
# Listens on http://127.0.0.1:9288

$Port = 9288
$ErrorActionPreference = "Stop"
$LogPath = Join-Path $PSScriptRoot "print-agent.log"

$BridgeHtml = @'
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Fast POS USB</title></head>
<body style="font-family:sans-serif;padding:16px">
<p id="s">Connecting USB printer...</p>
<script>
async function notify(type, extra) {
  var t = window.opener || window.parent;
  if (t && t !== window) t.postMessage(Object.assign({ type: type }, extra || {}), "*");
}
window.addEventListener("message", async function(e) {
  var d = e.data || {};
  var reply = function(data) { if (e.source) e.source.postMessage(data, e.origin || "*"); };
  if (d.type === "fastpos-health") {
    try {
      var h = await fetch("/health");
      var j = await h.json();
      reply({ type: "fastpos-health-result", id: d.id, ok: j.ok, printer: j.printer });
    } catch (err) {
      reply({ type: "fastpos-health-result", id: d.id, error: String(err) });
    }
  }
  if (d.type === "fastpos-print") {
    try {
      var r = await fetch("/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d.payload || {})
      });
      var j = await r.json();
      if (!r.ok || j.error) reply({ type: "fastpos-print-result", id: d.id, error: j.error || "Print failed" });
      else reply({ type: "fastpos-print-result", id: d.id, ok: true, printer: j.printer });
    } catch (err) {
      reply({ type: "fastpos-print-result", id: d.id, error: String(err) });
    }
  }
});
(async function() {
  try {
    var h = await fetch("/health");
    var j = await h.json();
    if (!j.ok) throw new Error("Agent not ready");
    if (!j.printer) throw new Error("No default printer. Installed: " + ((j.installed || []).join(", ") || "none") + ". Create printer.txt with exact name.");
    document.getElementById("s").textContent = "USB ready: " + j.printer;
    notify("fastpos-bridge-ready", { printer: j.printer });
  } catch (err) {
    document.getElementById("s").textContent = "USB connect failed";
    notify("fastpos-bridge-error", { error: String(err) });
  }
})();
</script>
</body></html>
'@

function Write-Log([string]$Message) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  try {
    Add-Content -Path $LogPath -Value $line -Encoding UTF8
  } catch { }
}

function Get-InstalledPrinterNames {
  $names = New-Object System.Collections.Generic.List[string]

  try {
    Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop |
      ForEach-Object { [void]$names.Add([string]$_.Name) }
  } catch {
    try {
      Get-Printer -ErrorAction Stop | ForEach-Object { [void]$names.Add([string]$_.Name) }
    } catch { }
  }

  return @($names | Where-Object { $_ } | Select-Object -Unique)
}

function Get-ConfiguredPrinterName {
  $path = Join-Path $PSScriptRoot "printer.txt"
  if (-not (Test-Path $path)) { return $null }
  $name = (Get-Content $path -Raw -ErrorAction SilentlyContinue).Trim()
  if ($name) { return $name }
  return $null
}

function Get-DefaultPrinterName {
  $configured = Get-ConfiguredPrinterName
  if ($configured) { return $configured }

  try {
    $p = Get-CimInstance -ClassName Win32_Printer -Filter "Default='True'" -ErrorAction Stop |
      Select-Object -First 1
    if ($p -and $p.Name) { return [string]$p.Name }
  } catch { }

  try {
    $p = Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop |
      Where-Object { $_.Default -eq $true } |
      Select-Object -First 1
    if ($p -and $p.Name) { return [string]$p.Name }
  } catch { }

  try {
    $device = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows" -ErrorAction Stop).Device
    if ($device) {
      $name = ($device -split ",")[0].Trim()
      if ($name) { return $name }
    }
  } catch { }

  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $settings = New-Object System.Drawing.Printing.PrinterSettings
    if ($settings.PrinterName) { return [string]$settings.PrinterName }
  } catch { }

  try {
    $p = Get-Printer -ErrorAction Stop | Where-Object { $_.Default -eq $true } | Select-Object -First 1
    if ($p -and $p.Name) { return [string]$p.Name }
  } catch { }

  return $null
}

function Resolve-PrinterName([string]$RequestedName) {
  $name = $RequestedName
  if (-not $name -or $name -eq "default") {
    $name = Get-DefaultPrinterName
  }

  if ($name) {
    $installed = Get-InstalledPrinterNames
    if ($installed.Count -eq 0) { return $name }
    if ($installed -contains $name) { return $name }
    foreach ($candidate in $installed) {
      if ($candidate.Equals($name, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $candidate
      }
    }
  }

  if ($name) { return $name }

  $installed = Get-InstalledPrinterNames
  if ($installed.Count -eq 1) { return $installed[0] }

  $list = if ($installed.Count -gt 0) { $installed -join ", " } else { "none found" }
  throw "No default printer detected. Installed printers: $list. Put the exact Windows printer name in printer.txt in this folder."
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

function Send-HttpResponse($Stream, [int]$Code, [string]$Body, [string]$ContentType) {
  $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $status = switch ($Code) { 200 { "OK" } 204 { "No Content" } default { "Error" } }
  $header = "HTTP/1.1 $Code $status`r`n" +
    "Content-Type: $ContentType`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
    "Access-Control-Allow-Headers: Content-Type`r`n" +
    "Access-Control-Allow-Private-Network: true`r`n" +
    "Content-Length: $($bodyBytes.Length)`r`n" +
    "Connection: close`r`n`r`n"
  $hdr = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($hdr, 0, $hdr.Length)
  if ($bodyBytes.Length -gt 0) {
    $Stream.Write($bodyBytes, 0, $bodyBytes.Length)
  }
  $Stream.Flush()
}

function Find-HeaderEnd([byte[]]$Bytes) {
  for ($i = 0; $i -le $Bytes.Length - 4; $i++) {
    if ($Bytes[$i] -eq 13 -and $Bytes[$i + 1] -eq 10 -and $Bytes[$i + 2] -eq 13 -and $Bytes[$i + 3] -eq 10) {
      return $i + 4
    }
  }
  return -1
}

function Read-FullRequest([System.Net.Sockets.NetworkStream]$Stream) {
  $ms = New-Object System.IO.MemoryStream
  $buf = New-Object byte[] 8192
  $headerEnd = -1

  while ($headerEnd -lt 0 -and $ms.Length -lt 65536) {
    $n = $Stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
    $headerEnd = Find-HeaderEnd $ms.ToArray()
  }

  if ($headerEnd -lt 0) { return $null }

  $all = $ms.ToArray()
  $headerText = [System.Text.Encoding]::ASCII.GetString($all, 0, $headerEnd)
  $contentLength = 0
  foreach ($line in ($headerText -split "`r`n")) {
    if ($line -match '^(?i)Content-Length:\s*(\d+)') {
      $contentLength = [int]$Matches[1]
    }
  }

  $totalNeeded = $headerEnd + $contentLength
  while ($all.Length -lt $totalNeeded) {
    $n = $Stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { break }
    $ms.Write($buf, 0, $n)
    $all = $ms.ToArray()
  }

  $body = ""
  if ($contentLength -gt 0 -and $all.Length -gt $headerEnd) {
    $len = [Math]::Min($contentLength, $all.Length - $headerEnd)
    $body = [System.Text.Encoding]::UTF8.GetString($all, $headerEnd, $len)
  }

  return @{
    HeaderText = $headerText
    Body = $body
  }
}

function Handle-PrintRequest([string]$RawBody) {
  $payload = $RawBody | ConvertFrom-Json
  $b64 = [string]$payload.data
  if (-not $b64) { throw "Missing data" }
  $name = Resolve-PrinterName ([string]$payload.printerName)
  $bytes = [Convert]::FromBase64String($b64)
  Send-RawPrint $bytes $name
  Write-Log "Printed $($bytes.Length) bytes to $name"
  return (@{ ok = $true; printer = $name; bytes = $bytes.Length } | ConvertTo-Json -Compress)
}

function Handle-Client($Client) {
  try {
    $stream = $Client.GetStream()
    $stream.ReadTimeout = 60000
    $request = Read-FullRequest $stream
    if (-not $request) { return }

    $lines = $request.HeaderText -split "`r`n"
    $requestLine = $lines[0]
    if (-not $requestLine) { return }

    $parts = $requestLine.Split(" ")
    $method = $parts[0]
    $path = if ($parts.Length -gt 1) { ($parts[1] -split "\?")[0] } else { "/" }

    if ($method -eq "OPTIONS") {
      Send-HttpResponse $stream 204 "{}" "application/json; charset=utf-8"
      return
    }

    if ($method -eq "GET" -and $path -eq "/health") {
      $dp = Get-DefaultPrinterName
      $installed = Get-InstalledPrinterNames
      $json = (@{
        ok = $true
        printer = $dp
        installed = $installed
      } | ConvertTo-Json -Compress)
      Send-HttpResponse $stream 200 $json "application/json; charset=utf-8"
      return
    }

    if ($method -eq "GET" -and $path -eq "/bridge") {
      Send-HttpResponse $stream 200 $BridgeHtml "text/html; charset=utf-8"
      return
    }

    if ($method -eq "POST" -and $path -eq "/print") {
      try {
        $json = Handle-PrintRequest $request.Body
        Send-HttpResponse $stream 200 $json "application/json; charset=utf-8"
      } catch {
        $msg = $_.Exception.Message -replace '"', "'"
        Write-Log "Print error: $msg"
        Send-HttpResponse $stream 500 "{ `"error`": `"$msg`" }" "application/json; charset=utf-8"
      }
      return
    }

    Send-HttpResponse $stream 404 "{ `"error`": `"Not found`" }" "application/json; charset=utf-8"
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
