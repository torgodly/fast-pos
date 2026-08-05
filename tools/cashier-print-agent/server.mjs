import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "config.json");

function loadConfig() {
  const defaults = { port: 9288, printerName: "" };
  if (!fs.existsSync(configPath)) return defaults;
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
  } catch {
    return defaults;
  }
}

const config = loadConfig();
const PORT = config.port ?? 9288;
let activePrinter = String(config.printerName || "").trim();

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `PowerShell exit ${code}`));
    });
  });
}

async function resolveDefaultPrinter() {
  if (process.platform !== "win32") return null;
  try {
    const name = await runPowerShell(
      "(Get-Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)",
    );
    return name || null;
  } catch {
    return null;
  }
}

async function ensurePrinter(requested) {
  const wanted = String(requested || "").trim();
  if (wanted && wanted.toLowerCase() !== "default") {
    return wanted;
  }
  if (activePrinter && activePrinter.toLowerCase() !== "default") {
    return activePrinter;
  }
  activePrinter = (await resolveDefaultPrinter()) || "";
  return activePrinter;
}

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
    return Promise.reject(new Error("Windows only"));
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
    const printer = await ensurePrinter();
    sendJson(res, 200, {
      ok: true,
      printer: printer || null,
      mode: "default Windows printer — no config needed",
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
        if (!data) {
          sendJson(res, 400, { error: "Missing print data" });
          return;
        }
        const printerName = await ensurePrinter(payload?.printerName);
        if (!printerName) {
          sendJson(res, 500, {
            error: "No default printer in Windows — set a default receipt printer",
          });
          return;
        }
        await printRawWindows(Buffer.from(data, "base64"), printerName);
        sendJson(res, 200, { ok: true, printer: printerName });
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

ensurePrinter().then((printer) => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Fast POS Print — http://127.0.0.1:${PORT}`);
    console.log(
      printer
        ? `Using printer: ${printer}`
        : "Warning: no default printer — set one in Windows Settings",
    );
  });
});
