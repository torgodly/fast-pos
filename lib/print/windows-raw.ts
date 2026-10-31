import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { isExplicitWindowsPrinterName } from "./checkout-print-mode";

const POWERSHELL = process.env.SystemRoot
  ? path.join(
      process.env.SystemRoot,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    )
  : "powershell.exe";

const DEFAULT_TIMEOUT_MS = 15_000;

const WINDOWS_RAW_PRINT_WORKER_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { [Console]::InputEncoding = [System.Text.Encoding]::UTF8 } catch { }

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

function Send-RawPrint([string]$PrinterName, [byte[]]$Bytes) {
  $h = [IntPtr]::Zero
  if (-not [RawPrinterHelper]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
    throw "Cannot open printer: $PrinterName"
  }
  try {
    $doc = New-Object RawPrinterHelper+DOCINFOW
    $doc.pDocName = "FastPOS"
    $doc.pDatatype = "RAW"
    if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, [ref]$doc)) {
      throw "StartDocPrinter failed: $PrinterName"
    }
    try {
      [void][RawPrinterHelper]::StartPagePrinter($h)
      $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($Bytes.Length)
      try {
        [Runtime.InteropServices.Marshal]::Copy($Bytes, 0, $ptr, $Bytes.Length)
        $written = 0
        if (-not [RawPrinterHelper]::WritePrinter($h, $ptr, $Bytes.Length, [ref]$written)) {
          throw "WritePrinter failed: $PrinterName"
        }
        if ($written -ne $Bytes.Length) {
          throw "Short write: $written/$($Bytes.Length)"
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
}

[Console]::Out.WriteLine("READY")
[Console]::Out.Flush()

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim().Length -eq 0) { continue }
  try {
    $parts = $line.Split([char]9)
    if ($parts.Length -ne 3 -or $parts[0] -ne "PRINT") { throw "Bad print command" }
    $printerName = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[1]))
    $dataPath = $parts[2]
    $bytes = [System.IO.File]::ReadAllBytes($dataPath)
    if ($bytes.Length -eq 0) { throw "Print data is empty" }
    Send-RawPrint $printerName $bytes
    [Console]::Out.WriteLine("OK")
  } catch {
    $message = $_.Exception.Message -replace "[\r\n]", " "
    [Console]::Out.WriteLine("ERR" + [char]9 + $message)
  }
  [Console]::Out.Flush()
}
`;

export type RawPrintWorker = {
  stdin: { write: (chunk: string) => boolean };
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill: () => void;
  onExit: (listener: () => void) => void;
  onError: (listener: (error: Error) => void) => void;
  onStdinError: (listener: (error: Error) => void) => void;
};

export type WorkerFactory = () => RawPrintWorker;

export type RawPrintOptions = {
  tempDir?: string;
  createWorker?: WorkerFactory;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
};

function createPowerShellWorker(): RawPrintWorker {
  const child = spawn(
    POWERSHELL,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(WINDOWS_RAW_PRINT_WORKER_SCRIPT, "utf16le").toString("base64"),
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );

  const stdin = child.stdin!;
  const stdout = child.stdout!;
  const stderr = child.stderr!;

  return {
    stdin: { write: (chunk) => stdin.write(chunk) },
    stdout,
    stderr,
    kill: () => {
      child.kill();
    },
    onExit: (listener) => {
      child.once("exit", listener);
    },
    onError: (listener) => {
      child.once("error", listener);
    },
    onStdinError: (listener) => {
      stdin.on("error", (error) => {
        listener(error instanceof Error ? error : new Error(String(error)));
      });
    },
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string | (() => string),
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(typeof message === "function" ? message() : message));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Pending = {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
};

class RawPrintClient {
  private worker: RawPrintWorker | null = null;
  private ready: Promise<RawPrintWorker> | null = null;
  private lines: readline.Interface | null = null;
  private queue: Promise<void> = Promise.resolve();
  private handshake: Pending | null = null;
  private pending: Pending | null = null;
  private stderrTail = "";

  constructor(
    private readonly createWorker: WorkerFactory,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  request(printerName: string, dataPath: string): Promise<void> {
    const run = () => this.send(printerName, dataPath);
    const result = this.queue.then(run, run);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private ensureWorker(): Promise<RawPrintWorker> {
    if (this.worker && this.ready) return this.ready;

    const worker = this.createWorker();
    this.worker = worker;
    this.stderrTail = "";

    worker.stderr.on("data", (chunk: Buffer | string) => {
      if (this.worker !== worker) return;
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-4096);
    });

    const lines = readline.createInterface({ input: worker.stdout });
    this.lines = lines;
    lines.on("line", (line) => {
      if (this.worker !== worker) return;
      this.handleLine(line);
    });

    worker.onError((error) => {
      if (this.worker !== worker) return;
      this.fail(error);
    });
    worker.onStdinError((error) => {
      if (this.worker !== worker) return;
      this.fail(error);
    });
    worker.onExit(() => {
      if (this.worker !== worker) return;
      this.fail(new Error("انتهت عملية الطباعة على Windows"));
    });

    this.ready = withTimeout(
      new Promise<RawPrintWorker>((resolve, reject) => {
        this.handshake = { resolve: () => resolve(worker), reject };
      }),
      this.timeoutMs,
      () =>
        this.describeFailure(new Error("تعذر تشغيل خدمة الطباعة على Windows")),
      () => this.fail(new Error("تعذر تشغيل خدمة الطباعة على Windows")),
    );

    return this.ready;
  }

  private handleLine(line: string) {
    if (this.handshake) {
      if (line !== "READY") {
        // A stray first line means the worker is not the protocol peer we
        // expect: fail() resets the singleton state and kills the child so the
        // next print spawns a fresh worker instead of reusing a dead promise.
        this.fail(new Error(`استجابة غير متوقعة من الطباعة: ${line}`));
        return;
      }
      const handshake = this.handshake;
      this.handshake = null;
      handshake.resolve(line);
      return;
    }
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      pending.resolve(line);
    }
  }

  private async send(printerName: string, dataPath: string) {
    const worker = await this.ensureWorker();
    const encodedName = Buffer.from(printerName, "utf8").toString("base64");
    const response = new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
    });

    try {
      worker.stdin.write(`PRINT\t${encodedName}\t${dataPath}\n`);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }

    const line = await withTimeout(
      response,
      this.timeoutMs,
      () =>
        this.describeFailure(new Error("انتهت مهلة الطباعة على طابعة Windows")),
      () => this.fail(new Error("انتهت مهلة الطباعة على طابعة Windows")),
    );
    if (line === "OK") return;
    throw new Error(line.startsWith("ERR\t") ? line.slice(4) : line);
  }

  private describeFailure(error: Error) {
    const lastLine = this.stderrTail.trim().split(/\r?\n/).pop()?.trim();
    return lastLine ? `${error.message}: ${lastLine}` : error.message;
  }

  private fail(error: Error) {
    const worker = this.worker;
    const handshake = this.handshake;
    const pending = this.pending;
    if (!worker && !handshake && !pending) return;

    const message = this.describeFailure(error);

    const lines = this.lines;
    this.reset();
    lines?.close();
    worker?.kill();

    const wrapped = new Error(message);
    handshake?.reject(wrapped);
    pending?.reject(wrapped);
  }

  private reset() {
    this.worker = null;
    this.ready = null;
    this.lines = null;
    this.handshake = null;
    this.pending = null;
  }
}

type RawPrintGlobal = typeof globalThis & {
  __fastposRawPrinter?: RawPrintClient;
};

const injectedClients = new WeakMap<WorkerFactory, RawPrintClient>();

function clientFor(options: RawPrintOptions): RawPrintClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options.createWorker) {
    let client = injectedClients.get(options.createWorker);
    if (!client) {
      client = new RawPrintClient(options.createWorker, timeoutMs);
      injectedClients.set(options.createWorker, client);
    }
    return client;
  }

  const scope = globalThis as RawPrintGlobal;
  if (!scope.__fastposRawPrinter) {
    scope.__fastposRawPrinter = new RawPrintClient(
      createPowerShellWorker,
      timeoutMs,
    );
  }
  return scope.__fastposRawPrinter;
}

export async function printRawToWindowsPrinter(
  printerName: string,
  data: Uint8Array,
  options: RawPrintOptions = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    throw new Error("الطباعة المباشرة متاحة فقط على جهاز Windows");
  }

  const name = printerName.trim();
  if (!isExplicitWindowsPrinterName(name)) {
    throw new Error(
      "اختر طابعة Windows محددة — الطابعة الافتراضية تتبع حساب الخدمة وقد تطبع على طابعة أخرى",
    );
  }

  if (data.length === 0) {
    throw new Error("بيانات الطباعة فارغة");
  }

  const tempDir = options.tempDir ?? os.tmpdir();
  const printDir = await fs.mkdtemp(path.join(tempDir, "fastpos-print-"));
  const dataPath = path.join(printDir, "receipt.bin");

  try {
    await fs.writeFile(dataPath, data);
    await clientFor(options).request(name, dataPath);
  } finally {
    await fs.rm(printDir, { recursive: true, force: true }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Failed to remove print temp directory ${printDir}: ${message}`,
      );
    });
  }
}
