import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    console.error("Missing config.json — copy config.example.json and set printerName");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

const config = loadConfig();
const PORT = config.port ?? 9288;
const DEFAULT_PRINTER = config.printerName;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(JSON.stringify(body));
}

function printRawWindows(buffer, printerName) {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("Local USB printing agent supports Windows only"));
  }

  const tmp = path.join(os.tmpdir(), `fastpos-${Date.now()}.bin`);
  fs.writeFileSync(tmp, buffer);

  const psScript = `
$ErrorActionPreference = 'Stop'
$bytes = [IO.File]::ReadAllBytes('${tmp.replace(/\\/g, "\\\\")}')
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
$h = [IntPtr]::Zero
if (-not [RawPrinterHelper]::OpenPrinter('${printerName.replace(/'/g, "''")}', [ref]$h, [IntPtr]::Zero)) {
  throw "OpenPrinter failed for ${printerName.replace(/'/g, "''")}"
}
try {
  $doc = New-Object RawPrinterHelper+DOCINFOW
  $doc.pDocName = 'FastPOS'
  $doc.pDatatype = 'RAW'
  if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, [ref]$doc)) { throw 'StartDocPrinter failed' }
  try {
    [void][RawPrinterHelper]::StartPagePrinter($h)
    $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    $written = 0
    if (-not [RawPrinterHelper]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)) { throw 'WritePrinter failed' }
    [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
    [void][RawPrinterHelper]::EndPagePrinter($h)
  } finally {
    [void][RawPrinterHelper]::EndDocPrinter($h)
  }
} finally {
  [void][RawPrinterHelper]::ClosePrinter($h)
}
`;

  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      { windowsHide: true },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `PowerShell exit ${code}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, printer: DEFAULT_PRINTER, platform: process.platform });
    return;
  }

  if (req.method === "GET" && req.url === "/printers" && process.platform === "win32") {
    const listScript =
      "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress";
    const child = spawn("powershell.exe", ["-NoProfile", "-Command", listScript], {
      windowsHide: true,
    });
    let stdout = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.on("close", () => {
      try {
        const names = JSON.parse(stdout || "[]");
        sendJson(res, 200, { printers: Array.isArray(names) ? names : [names] });
      } catch {
        sendJson(res, 200, { printers: [] });
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/print") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body);
        const data = payload?.data;
        const printerName = String(payload?.printerName || DEFAULT_PRINTER || "").trim();
        if (!data || !printerName) {
          sendJson(res, 400, { error: "Missing print data or printer name" });
          return;
        }
        const buffer = Buffer.from(data, "base64");
        await printRawWindows(buffer, printerName);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : "Print failed",
        });
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Fast POS Print Agent — http://127.0.0.1:${PORT}`);
  console.log(`Default printer: ${DEFAULT_PRINTER || "(set in config.json)"}`);
  console.log("Silent RAW printing — no browser dialog");
});
