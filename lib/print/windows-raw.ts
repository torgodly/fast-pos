import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const POWERSHELL = process.env.SystemRoot
  ? path.join(
      process.env.SystemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    )
  : "powershell.exe";

const WINDOWS_RAW_PRINT_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Get-InstalledPrinterNames {
  $names = New-Object System.Collections.Generic.List[string]
  try {
    Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop |
      ForEach-Object { [void]$names.Add([string]$_.Name) }
  } catch {
    try {
      Get-Printer -ErrorAction Stop |
        ForEach-Object { [void]$names.Add([string]$_.Name) }
    } catch { }
  }
  return @($names | Where-Object { $_ } | Select-Object -Unique)
}

function Get-DefaultPrinterName {
  try {
    $p = Get-CimInstance -ClassName Win32_Printer -Filter "Default='True'" -ErrorAction Stop |
      Select-Object -First 1
    if ($p -and $p.Name) { return [string]$p.Name }
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
  if (-not $name) {
    $installed = @(Get-InstalledPrinterNames)
    $list = if ($installed.Count -gt 0) { $installed -join ", " } else { "none found" }
    throw "No default printer detected. Installed printers: $list"
  }

  $installed = @(Get-InstalledPrinterNames)
  if ($installed.Count -gt 0) {
    $match = $installed | Where-Object { $_ -eq $name } | Select-Object -First 1
    if (-not $match) {
      $match = $installed | Where-Object {
        $_.Equals($name, [System.StringComparison]::OrdinalIgnoreCase)
      } | Select-Object -First 1
    }
    if (-not $match) {
      throw "Printer not found: $name. Installed printers: $($installed -join ', ')"
    }
    return [string]$match
  }
  return $name
}

$printerName = Resolve-PrinterName ([string]$env:FASTPOS_PRINTER_NAME)
$dataPath = [string]$env:FASTPOS_PRINT_FILE
if (-not $dataPath) { throw "Missing print data file" }
$bytes = [System.IO.File]::ReadAllBytes($dataPath)
if ($bytes.Length -eq 0) { throw "Print data is empty" }

if (-not ("RawPrinterHelper" -as [type])) {
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
"@
}

$h = [IntPtr]::Zero
if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$h, [IntPtr]::Zero)) {
  throw "Cannot open printer: $printerName"
}
try {
  $doc = New-Object RawPrinterHelper+DOCINFOW
  $doc.pDocName = "FastPOS"
  $doc.pDatatype = "RAW"
  if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, [ref]$doc)) {
    throw "StartDocPrinter failed: $printerName"
  }
  try {
    [void][RawPrinterHelper]::StartPagePrinter($h)
    $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
      [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
      $written = 0
      if (-not [RawPrinterHelper]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)) {
        throw "WritePrinter failed: $printerName"
      }
      if ($written -ne $bytes.Length) {
        throw "Short write: $written/$($bytes.Length)"
      }
    } finally {
      [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
    }
    [void][RawPrinterHelper]::EndPagePrinter($h)
  } finally {
    [void][RawPrinterHelper]::EndDocPrinter($h)
  }
} finally {
  [void][RawPrinterHelper]::ClosePrinter($h)
}

Write-Output "OK:$printerName"
`;

export type PowerShellRunner = (
  script: string,
  env: NodeJS.ProcessEnv,
) => Promise<string>;

export type RawPrintOptions = {
  runPowerShell?: PowerShellRunner;
  tempDir?: string;
};

function runPowerShell(
  script: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (process.platform !== "win32") {
    return Promise.reject(
      new Error("الطباعة التلقائية متاحة فقط على جهاز Windows"),
    );
  }

  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ],
      {
        timeout: 20_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        env,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail =
            String(stderr ?? "").trim() ||
            error.message ||
            "تعذر إرسال الفاتورة إلى طابعة Windows";
          reject(new Error(detail));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export async function printRawToWindowsPrinter(
  printerName: string,
  data: Uint8Array,
  options: RawPrintOptions = {},
): Promise<void> {
  if (data.length === 0) {
    throw new Error("بيانات الطباعة فارغة");
  }

  const tempDir = options.tempDir ?? os.tmpdir();
  const printDir = await fs.mkdtemp(path.join(tempDir, "fastpos-print-"));
  const dataPath = path.join(printDir, "receipt.bin");

  try {
    await fs.writeFile(dataPath, data);
    const runner = options.runPowerShell ?? runPowerShell;
    await runner(WINDOWS_RAW_PRINT_SCRIPT, {
      ...process.env,
      FASTPOS_PRINTER_NAME: printerName.trim() || "default",
      FASTPOS_PRINT_FILE: dataPath,
    });
  } finally {
    await fs.rm(printDir, { recursive: true, force: true }).catch(() => {});
  }
}
