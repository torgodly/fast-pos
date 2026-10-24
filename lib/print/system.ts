import { execFile } from "node:child_process";
import path from "node:path";
import { parseSystemPrintersJson } from "@/lib/print/system-printers";
import type { SystemPrinter } from "@/lib/types";

const POWERSHELL = process.env.SystemRoot
  ? path.join(
      process.env.SystemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    )
  : "powershell.exe";

const LIST_PRINTERS_SCRIPT = String.raw`
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$tcpPorts = @{}
Get-CimInstance -ClassName Win32_TCPIPPrinterPort -ErrorAction SilentlyContinue | ForEach-Object {
  $tcpPorts[[string]$_.Name] = @{ host = [string]$_.HostAddress; port = [int]$_.PortNumber }
}
$list = @(
  Get-CimInstance -ClassName Win32_Printer -ErrorAction SilentlyContinue | ForEach-Object {
    $port = $tcpPorts[[string]$_.PortName]
    [pscustomobject]@{
      name = [string]$_.Name
      driver = [string]$_.DriverName
      portName = [string]$_.PortName
      isDefault = [bool]$_.Default
      host = if ($port) { [string]$port.host } else { $null }
      port = if ($port -and [int]$port.port -gt 0) { [int]$port.port } else { $null }
    }
  }
)
ConvertTo-Json -InputObject $list -Compress
`;

function runPowerShell(script: string): Promise<string> {
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
        timeout: 12_000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export async function listSystemPrinters(): Promise<SystemPrinter[]> {
  if (process.platform !== "win32") {
    throw new Error("قراءة طابعات النظام متاحة فقط على Windows");
  }

  try {
    const output = await runPowerShell(LIST_PRINTERS_SCRIPT);
    return parseSystemPrintersJson(output);
  } catch (error) {
    console.error("System printer enumeration failed:", error);
    throw new Error("تعذر قراءة طابعات النظام المثبتة على جهاز السيرفر");
  }
}
