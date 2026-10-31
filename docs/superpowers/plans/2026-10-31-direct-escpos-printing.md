# Direct ESC/POS printing from Windows system printers — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Windows system receipt printer print raw ESC/POS as fast as a network printer, and reduce the printers modal to exactly two connection types: Windows system printer or network IP printer.

**Architecture:** One persistent hidden PowerShell worker (spawned lazily, winspool P/Invoke loaded once) receives tab-delimited print commands over stdin and spools RAW bytes. All checkout/report/kitchen printing routes to either this worker (`connectionType = "local"`) or raw TCP (`"network"`). The browser/Chrome print path is removed end to end.

**Tech Stack:** Next.js 16 server actions, TypeScript, vitest, better-sqlite3/Drizzle (tests), PowerShell + winspool.drv, ESC/POS, Inno Setup.

**Spec:** [docs/superpowers/specs/2026-10-31-direct-escpos-printing-design.md](file:///C:/Users/zakaria/fast-pos/docs/superpowers/specs/2026-10-31-direct-escpos-printing-design.md)

## Global Constraints

- **Do not create git commits.** The owner commits. Verify instead.
- **Do not revert the owner's `package.json` edit**: `installer:build` must keep running the full script (no `-SkipNpm`) in `package.json`; direct rebuilds may call `scripts/build-installer.ps1 -SkipNpm`.
- Do not change the DB schema. `printers.auto_print` stays in `lib/db/schema.ts` and `ensureSchema` but new code never reads it.
- Never use a browser print dialog anywhere in the app.
- Failure semantics: payment/close always succeeds, the Arabic error is shown, and the receipt can be reprinted from مبيعاتي.
- `local` rows whose `host` is empty or `default` are **never rewritten automatically**; they surface an Arabic error/warning.
- Kitchen printers may use either connection type.
- Before writing Next.js code, follow `AGENTS.md`: consult `node_modules/next/dist/docs/` for any Next API you touch. This plan changes no Next APIs, only server actions and components.
- Verify UI in a browser; verify printing on the installed build, not just `next dev`.
- The owner types their own credentials; never enter them.

---

## File map

| File | Responsibility |
| --- | --- |
| `lib/print/windows-raw.ts` | Persistent PowerShell raw-print worker + `printRawToWindowsPrinter` |
| `lib/print/windows-raw.test.ts` | Worker protocol, queue, timeout, respawn, validation |
| `lib/print/windows-raw.integration.test.ts` | Real worker error path (env-gated, Windows) |
| `lib/print/checkout-print-mode.ts` | `local → windows`, `network → network`, queue-name validator |
| `lib/print/report-print.ts` | Shift-report mode + admin fix message |
| `app/actions/orders.ts` | Raw/local and TCP/network checkout printing only |
| `app/actions/reports.ts` | Local report printing through the worker |
| `app/actions/admin.ts` | `upsertPrinter` two types, `testPrinter` for both |
| `lib/audit.ts` | No browser special case |
| `components/PayButtons.tsx`, `QuickSaleBoard.tsx`, `PreviewReceiptButton.tsx`, `ReprintReceiptButton.tsx`, `PrintReportButton.tsx` | Consume server `printOk`/`printError` only |
| `components/admin/PrintersAdmin.tsx` | Two-type modal + table |
| `lib/print/receipts.ts` | Types + payment label only (HTML builders deleted) |
| `lib/print/finish-checkout-print.ts` | Deleted |
| `lib/print/receipts.test.ts`, `order-number.test.ts`, `lib/orders/pay-hold.test.ts`, `PrintersAdmin.test.tsx` | Rewritten/ported tests |
| `app/actions/admin-printers.test.ts` | New action tests (create) |
| `PROJECT_INDEX.md`, `README.md`, `docs/worklog/2026-10-31-direct-escpos-printing.md` | Documentation |

---

### Task 1: Persistent Windows raw-print worker

**Files:**
- Modify: `lib/print/windows-raw.ts` (full rewrite)
- Modify: `lib/print/windows-raw.test.ts` (full rewrite)
- Modify: `lib/print/windows-raw.integration.test.ts`

**Interfaces:**
- Consumes: `validateSystemPrinterName(host)` from `lib/print/checkout-print-mode.ts` (exists today as `validateAutoPrintHost`; Task 2 introduces the new name — for Task 1 import `isExplicitWindowsPrinterName` instead and inline the message so Task 1 is self-contained).
- Produces:
  - `printRawToWindowsPrinter(printerName: string, data: Uint8Array, options?: RawPrintOptions): Promise<void>`
  - `RawPrintOptions = { tempDir?: string; createWorker?: WorkerFactory; platform?: NodeJS.Platform; timeoutMs?: number }`
  - `RawPrintWorker` and `WorkerFactory` types used only by tests.

- [ ] **Step 1: Write the failing worker tests**

Replace `lib/print/windows-raw.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  printRawToWindowsPrinter,
  type RawPrintWorker,
} from "./windows-raw";

async function makeTempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "fastpos-raw-test-"));
}

type FakeOptions = {
  ready?: boolean;
  onCommand?: (line: string) => string | null;
};

function fakeWorker(options: FakeOptions = {}) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const commands: string[] = [];
  const listeners: { exit?: () => void; error?: (error: Error) => void } = {};
  let killed = false;
  let buffer = "";

  const worker: RawPrintWorker = {
    stdin,
    stdout,
    stderr,
    kill: () => {
      killed = true;
      listeners.exit?.();
    },
    onExit: (listener) => {
      listeners.exit = listener;
    },
    onError: (listener) => {
      listeners.error = listener;
    },
  };

  if (options.ready !== false) stdout.write("READY\n");

  stdin.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      commands.push(line);
      const reply = options.onCommand?.(line) ?? "OK";
      if (reply) stdout.write(`${reply}\n`);
      newline = buffer.indexOf("\n");
    }
  });

  return {
    worker,
    commands,
    stdout,
    stderr,
    exit: () => listeners.exit?.(),
    isKilled: () => killed,
  };
}

function decodeName(line: string) {
  const [, encoded] = line.split("\t");
  return Buffer.from(encoded, "base64").toString("utf8");
}

describe("printRawToWindowsPrinter", () => {
  it("spawns one worker, sends the exact bytes, and reuses the warm worker", async () => {
    const tempRoot = await makeTempRoot();
    let seenBytes: number[] = [];
    let spawns = 0;
    const fake = fakeWorker({
      onCommand: (line) => {
        const [, , file] = line.split("\t");
        seenBytes = [...readFileSync(file)];
        return "OK";
      },
    });
    const data = new Uint8Array([0x1b, 0x40, 0x00, 0xff, 0x0a]);

    try {
      const options = {
        tempDir: tempRoot,
        createWorker: () => {
          spawns += 1;
          return fake.worker;
        },
      };

      await printRawToWindowsPrinter("XP-80C", data, options);
      await printRawToWindowsPrinter("XP-80C", data, options);

      expect(spawns).toBe(1);
      expect(fake.commands).toHaveLength(2);
      expect(decodeName(fake.commands[0])).toBe("XP-80C");
      expect(seenBytes).toEqual([...data]);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("propagates a worker ERR without killing the worker", async () => {
    const tempRoot = await makeTempRoot();
    const fake = fakeWorker({
      onCommand: () => "ERR\tCannot open printer: XP-80C",
    });

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), {
          tempDir: tempRoot,
          createWorker: () => fake.worker,
        }),
      ).rejects.toThrow("Cannot open printer: XP-80C");

      expect(fake.isKilled()).toBe(false);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects empty print data before spawning a worker", async () => {
    const tempRoot = await makeTempRoot();
    let spawns = 0;

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array(), {
          tempDir: tempRoot,
          createWorker: () => {
            spawns += 1;
            return fakeWorker().worker;
          },
        }),
      ).rejects.toThrow("بيانات الطباعة فارغة");

      expect(spawns).toBe(0);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects the Windows default queue and empty names", async () => {
    let spawns = 0;
    const createWorker = () => {
      spawns += 1;
      return fakeWorker().worker;
    };

    for (const name of ["", "  ", "default", "DEFAULT"]) {
      await expect(
        printRawToWindowsPrinter(name, new Uint8Array([1]), {
          createWorker,
          platform: "win32",
        }),
      ).rejects.toThrow(/طابعة Windows محددة/);
    }
    expect(spawns).toBe(0);
  });

  it("rejects non-Windows platforms without spawning", async () => {
    let spawns = 0;

    await expect(
      printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), {
        platform: "linux",
        createWorker: () => {
          spawns += 1;
          return fakeWorker().worker;
        },
      }),
    ).rejects.toThrow(/Windows/);

    expect(spawns).toBe(0);
  });

  it("kills the worker on timeout and respawns on the next print", async () => {
    const tempRoot = await makeTempRoot();
    const silent = fakeWorker({ onCommand: () => null });
    const healthy = fakeWorker({ onCommand: () => "OK" });
    let spawns = 0;
    const createWorker = () => {
      spawns += 1;
      return spawns === 1 ? silent.worker : healthy.worker;
    };
    const options = { tempDir: tempRoot, createWorker, timeoutMs: 25 };

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options),
      ).rejects.toThrow(/مهلة/);
      expect(silent.isKilled()).toBe(true);

      await printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options);
      expect(spawns).toBe(2);
      expect(healthy.commands).toHaveLength(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("serializes concurrent prints over one worker", async () => {
    const tempRoot = await makeTempRoot();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = fakeWorker();
    const options = {
      tempDir: tempRoot,
      createWorker: () => fake.worker,
    };

    fake.worker.stdin.write = (chunk: string) => {
      const [, encoded, file] = chunk.trimEnd().split("\t");
      fake.commands.push(`PRINT\t${encoded}\t${file}`);
      void gate.then(() => fake.stdout.write("OK\n"));
      return true;
    };

    try {
      const first = printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options);
      const second = printRawToWindowsPrinter("XP-80C", new Uint8Array([2]), options);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fake.commands).toHaveLength(1);

      release();
      await Promise.all([first, second]);
      expect(fake.commands).toHaveLength(2);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("respawns after a worker crash", async () => {
    const tempRoot = await makeTempRoot();
    let crashing!: ReturnType<typeof fakeWorker>;
    crashing = fakeWorker({
      onCommand: () => {
        setTimeout(() => crashing.exit(), 0);
        return null;
      },
    });
    const healthy = fakeWorker({ onCommand: () => "OK" });
    let spawns = 0;
    const createWorker = () => {
      spawns += 1;
      return spawns === 1 ? crashing.worker : healthy.worker;
    };
    const options = { tempDir: tempRoot, createWorker, timeoutMs: 1000 };

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options),
      ).rejects.toThrow(/انتهت عملية الطباعة/);

      await printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options);
      expect(spawns).toBe(2);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run lib/print/windows-raw.test.ts`
Expected: FAIL — `printRawToWindowsPrinter` still expects `runPowerShell`; the new options/worker API does not exist.

- [ ] **Step 3: Implement the worker**

Replace the whole of `lib/print/windows-raw.ts` with:

```ts
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
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
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
      this.stderrTail = `${this.stderrTail}${String(chunk)}`.slice(-4096);
    });

    const lines = readline.createInterface({ input: worker.stdout });
    lines.on("line", (line) => this.handleLine(line));

    worker.onError((error) => this.fail(error));
    worker.onExit(() =>
      this.fail(new Error("انتهت عملية الطباعة على Windows")),
    );

    this.ready = withTimeout(
      new Promise<RawPrintWorker>((resolve, reject) => {
        this.handshake = { resolve: () => resolve(worker), reject };
      }),
      this.timeoutMs,
      "تعذر تشغيل خدمة الطباعة على Windows",
      () => this.fail(new Error("تعذر تشغيل خدمة الطباعة على Windows")),
    );

    return this.ready;
  }

  private handleLine(line: string) {
    if (this.handshake) {
      const handshake = this.handshake;
      this.handshake = null;
      if (line === "READY") handshake.resolve(line);
      else handshake.reject(new Error(`استجابة غير متوقعة من الطباعة: ${line}`));
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
      "انتهت مهلة الطباعة على طابعة Windows",
      () => this.fail(new Error("انتهت مهلة الطباعة على طابعة Windows")),
    );
    if (line === "OK") return;
    throw new Error(line.startsWith("ERR\t") ? line.slice(4) : line);
  }

  private fail(error: Error) {
    const worker = this.worker;
    const handshake = this.handshake;
    const pending = this.pending;
    if (!worker && !handshake && !pending) return;

    const lastLine = this.stderrTail.trim().split(/\r?\n/).pop()?.trim();
    const message = lastLine ? `${error.message}: ${lastLine}` : error.message;

    this.reset();
    worker?.kill();

    const wrapped = new Error(message);
    handshake?.reject(wrapped);
    pending?.reject(wrapped);
  }

  private reset() {
    this.worker = null;
    this.ready = null;
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
    await fs.rm(printDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run lib/print/windows-raw.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Update the integration test error expectation**

In `lib/print/windows-raw.integration.test.ts`, change the assertion to the worker's real error:

```ts
.rejects.toThrow(/Cannot open printer/);
```

- [ ] **Step 6: Run the integration test**

Run: `npx vitest run lib/print/windows-raw.integration.test.ts`
Expected: PASS on Windows with a 30 s timeout and **no paper** (invalid queue name).

---

### Task 2: Route only to Windows or network and remove the browser path

**Files:**
- Modify: `lib/print/checkout-print-mode.ts` (full rewrite)
- Modify: `lib/print/checkout-print-mode.test.ts` (full rewrite)
- Modify: `lib/print/report-print.ts` (full rewrite)
- Modify: `lib/print/report-print.test.ts` (full rewrite)
- Modify: `app/actions/orders.ts`
- Modify: `app/actions/reports.ts`
- Modify: `app/actions/admin.ts`
- Modify: `components/admin/PrintersAdmin.tsx` (minimal import/validation edit only)
- Modify: `lib/audit.ts`
- Modify: `components/PayButtons.tsx`, `components/QuickSaleBoard.tsx`, `components/PreviewReceiptButton.tsx`, `components/ReprintReceiptButton.tsx`, `components/PrintReportButton.tsx`
- Modify: `lib/orders/pay-hold.test.ts`
- Create: `app/actions/admin-printers.test.ts`

**Interfaces:**
- Consumes: `printRawToWindowsPrinter` from Task 1.
- Produces:
  - `CheckoutPrintMode = "windows" | "network"`
  - `resolveCheckoutPrintMode({ connectionType })`
  - `validateSystemPrinterName(host): string | null`
  - `resolveShiftReportPrintMode({ connectionType, host })`
  - `shiftReportPrintError({ connectionType, host })`

- [ ] **Step 1: Rewrite the routing tests (they fail against current code)**

Replace `lib/print/checkout-print-mode.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  resolveCheckoutPrintMode,
  validateSystemPrinterName,
} from "./checkout-print-mode";

describe("resolveCheckoutPrintMode", () => {
  it("uses the Windows spooler for a local system printer", () => {
    expect(resolveCheckoutPrintMode({ connectionType: "local" })).toBe(
      "windows",
    );
  });

  it("uses raw TCP for network printers", () => {
    expect(resolveCheckoutPrintMode({ connectionType: "network" })).toBe(
      "network",
    );
  });
});

describe("validateSystemPrinterName", () => {
  it("rejects the Windows default queue and empty names", () => {
    expect(validateSystemPrinterName("")).toMatch(/طابعة Windows محددة/);
    expect(validateSystemPrinterName("  ")).toMatch(/طابعة Windows محددة/);
    expect(validateSystemPrinterName("default")).toMatch(
      /طابعة Windows محددة/,
    );
    expect(validateSystemPrinterName("  DEFAULT  ")).toMatch(
      /طابعة Windows محددة/,
    );
  });

  it("accepts an explicit queue name", () => {
    expect(validateSystemPrinterName("XP-80C")).toBeNull();
  });
});
```

Replace `lib/print/report-print.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  resolveShiftReportPrintMode,
  shiftReportPrintError,
} from "./report-print";

const local = (host = "XP-80C") => ({ connectionType: "local", host });

describe("resolveShiftReportPrintMode", () => {
  it("uses raw TCP for network printers", () => {
    expect(
      resolveShiftReportPrintMode({
        connectionType: "network",
        host: "192.168.1.50",
      }),
    ).toBe("network");
  });

  it("uses the Windows spooler for a local system printer", () => {
    expect(resolveShiftReportPrintMode(local())).toBe("windows");
  });

  it("rejects a local printer that only uses the Windows default queue", () => {
    expect(resolveShiftReportPrintMode(local("default"))).toBe("unsupported");
    expect(resolveShiftReportPrintMode(local("  "))).toBe("unsupported");
  });
});

describe("shiftReportPrintError", () => {
  it("has no error for supported printers", () => {
    expect(
      shiftReportPrintError({
        connectionType: "network",
        host: "192.168.1.50",
      }),
    ).toBeNull();
    expect(shiftReportPrintError(local())).toBeNull();
  });

  it("tells the admin to select an explicit Windows queue", () => {
    expect(shiftReportPrintError(local("default"))).toContain(
      "طابعة Windows محددة",
    );
    expect(shiftReportPrintError(local(""))).toContain(
      "طابعة Windows محددة",
    );
  });
});
```

- [ ] **Step 2: Run the routing tests to confirm they fail**

Run: `npx vitest run lib/print/checkout-print-mode.test.ts lib/print/report-print.test.ts`
Expected: FAIL — old modules still return `browser`, require `autoPrint`, and export removed helpers.

- [ ] **Step 3: Implement the routing modules**

Replace `lib/print/checkout-print-mode.ts` with:

```ts
export type CheckoutPrintMode = "windows" | "network";

export function isExplicitWindowsPrinterName(host: string | null | undefined) {
  const name = host?.trim() ?? "";
  return name.length > 0 && name.toLowerCase() !== "default";
}

export function resolveCheckoutPrintMode(printer: {
  connectionType: string;
}): CheckoutPrintMode {
  // Fast POS runs as a Windows service (LocalSystem); a "default" queue is not
  // the cashier's default, so local rows must carry an explicit queue name.
  return printer.connectionType === "local" ? "windows" : "network";
}

export function validateSystemPrinterName(
  host: string | null | undefined,
): string | null {
  if (isExplicitWindowsPrinterName(host)) return null;
  return "اختر طابعة Windows محددة — الطابعة الافتراضية تتبع حساب الخدمة وقد تطبع على طابعة أخرى";
}
```

Replace `lib/print/report-print.ts` with:

```ts
import { isExplicitWindowsPrinterName } from "./checkout-print-mode";

export type ShiftReportPrintMode = "network" | "windows" | "unsupported";

type ReportPrinter = {
  connectionType: string;
  host: string;
};

export function resolveShiftReportPrintMode(
  printer: ReportPrinter,
): ShiftReportPrintMode {
  if (printer.connectionType !== "local") return "network";
  return isExplicitWindowsPrinterName(printer.host) ? "windows" : "unsupported";
}

export function shiftReportPrintError(printer: ReportPrinter): string | null {
  if (printer.connectionType !== "local") return null;
  if (isExplicitWindowsPrinterName(printer.host)) return null;
  return "اختر طابعة Windows محددة من الإدارة ← الطابعات لطباعة تقارير الوردية";
}
```

- [ ] **Step 4: Run the routing tests**

Run: `npx vitest run lib/print/checkout-print-mode.test.ts lib/print/report-print.test.ts`
Expected: PASS.

- [ ] **Step 5: Remove browser printing from `app/actions/orders.ts`**

Delete `buildBrowserCheckoutPrint` (currently lines 976–994). Remove the imports `buildCheckoutReceiptHtml` and `getReceiptLogoPrintDataUrl` (lines 28 and 31).

Replace `printCheckoutReceipt` (lines 996–1044) with:

```ts
type CheckoutPrintResult =
  | { printOk: true }
  | { printOk: false; printError: string };

async function printCheckoutReceipt(
  receipt: CheckoutReceiptData,
  printer: typeof printers.$inferSelect,
): Promise<CheckoutPrintResult> {
  try {
    const data = await buildCheckoutPrintBytes(receipt);
    if (resolveCheckoutPrintMode(printer) === "windows") {
      await printRawToWindowsPrinter(printer.host, data);
    } else {
      await printToPrinter({
        host: printer.host,
        port: printer.port,
        data,
      });
    }
    return { printOk: true };
  } catch (error) {
    return {
      printOk: false,
      printError:
        error instanceof Error ? error.message : "تعذر طباعة فاتورة الدفع",
    };
  }
}
```

In `payOrder`, remove `browserPrint?: boolean;` and `receiptHtml?: string;` from the success return type, and delete the block:

```ts
  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ok: true,
      nextUrl: `/cashier/${order.venueId}`,
      printOk: false,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
      message: `تم الدفع — اختر الطابعة في نافذة Chrome${inventory.note}`,
    };
  }
```

In `payQuickSale`, remove `browserPrint?: boolean;` and `receiptHtml?: string;` from the return type, replace the `receiptFailed` computation with:

```ts
  const receiptFailed = !printResult.printOk;
```

and delete the block:

```ts
  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ...base,
      printOk: !kitchenFailed,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
    };
  }
```

In `reprintOrderReceipt`, remove the two return-type fields and delete the block:

```ts
  if ("browserPrint" in printResult && printResult.browserPrint) {
    return {
      ok: true,
      printOk: false,
      browserPrint: true,
      receiptHtml: printResult.receiptHtml,
      message: "اختر الطابعة في نافذة Chrome",
    };
  }
```

In `PreviewPrintResult` and `finishPreviewPrint`, remove the two fields and delete the same style block (message `"اختر الطابعة في نافذة Chrome"`).

- [ ] **Step 6: Remove the HTML report branch in `app/actions/reports.ts`**

Replace the `lib/print/receipts` import block:

```ts
import {
  buildDetailedSalesReportHtml,
  type ReportSummaryPrintData,
} from "@/lib/print/receipts";
```

with:

```ts
import type { ReportSummaryPrintData } from "@/lib/print/receipts";
```

and add, next to the existing `printToPrinter` import:

```ts
import { printRawToWindowsPrinter } from "@/lib/print/windows-raw";
```

Keep `buildReportSummaryEscPos` imported from `@/lib/print/escpos` (it is already there).

Change the return type to:

```ts
): Promise<{ error: string } | { ok: true; message: string }> {
```

Replace the `if (printer.connectionType === "local") { ... }` block plus the network `try` with a single try:

```ts
  const summary = getReportSummary(filters);
  const data = summaryToPrintData(summary);

  try {
    const bytes = buildReportSummaryEscPos(data);
    if (printer.connectionType === "local") {
      await printRawToWindowsPrinter(printer.host, bytes);
    } else {
      await printToPrinter({
        host: printer.host,
        port: printer.port,
        data: bytes,
      });
    }
    recordSessionAudit(session, {
      venueId: summary.venue,
      kind: "report",
      printerName: printer.name,
      success: true,
      detail: `تقرير أصناف/مجموعات ${summary.fromSql} — ${summary.toSql} · ${data.itemSales.length} صنف · ${data.categorySales.length} مجموعة`,
    });
    return {
      ok: true,
      message: `طُبع التقرير على ${printer.name}`,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : `تعذر الطباعة على ${printer.name}`;
    recordSessionAudit(session, {
      venueId: summary.venue,
      kind: "report",
      printerName: printer.name,
      success: false,
      detail,
    });
    return { error: detail };
  }
```

- [ ] **Step 7: Remove the browser case from `lib/audit.ts`**

Change `auditPrintOutcome`'s parameter to `{ printOk?: boolean; printError?: string }` and delete the `browserPrint` branch.

- [ ] **Step 8: Remove browser handling from the five client components**

`components/PayButtons.tsx`:
- Delete `import { finishCheckoutPrint } from "@/lib/print/finish-checkout-print";`
- Replace the print block with:

```ts
      const printOk = result.printOk;
      const message = result.message;

      showToast(printOk ? "success" : "warning", message);
```

`components/QuickSaleBoard.tsx`:
- Delete the `finishCheckoutPrint` import (keep the `quickSalePayNotice` import).
- Replace the browser block with:

```ts
      const receiptFailed = payResult.receiptFailed;
```

`components/ReprintReceiptButton.tsx`:
- Delete the `finishCheckoutPrint` import.
- Replace the print block with:

```ts
      showToast(
        result.printOk ? "success" : "warning",
        result.message,
      );
```

`components/PreviewReceiptButton.tsx`:
- Delete the `finishCheckoutPrint` import.
- Replace the print block with:

```ts
      showToast(
        result.printOk ? "success" : "warning",
        result.message,
      );
```

`components/PrintReportButton.tsx`:
- Delete `import { printHtmlReceipt } from "@/lib/print/receipts";`
- Replace the whole `if ("browserPrint" in result ...) { ... }` block with:

```ts
      showToast("success", result.message);
```

- Remove the ` · متصفح` suffix from the printer option label:

```tsx
            {printer.name}
```

- Change the empty-state text to:

```tsx
        أضف طابعة من الإدارة ← الطابعات
```

- [ ] **Step 9: Update admin printer actions**

In `app/actions/admin.ts`:
- Replace the import:

```ts
import {
  resolvePrinterAutoPrint,
  validateAutoPrintHost,
} from "@/lib/print/checkout-print-mode";
```

with:

```ts
import { validateSystemPrinterName } from "@/lib/print/checkout-print-mode";
import { printRawToWindowsPrinter } from "@/lib/print/windows-raw";
```

In `upsertPrinter`:
- Delete `const requestedAutoPrint = ...` (lines 914–916).
- Delete the kitchen/local rejection block (lines 926–930).
- Replace the host/auto-print validation (lines 948–984) with:

```ts
    let resolvedPort = 9100;
    if (resolvedConnection === "network") {
      if (!host) {
        return { error: "عنوان IP مطلوب لطابعة الشبكة" };
      }
      const rawPort = String(formData.get("port") ?? "").trim();
      resolvedPort = rawPort ? Number(rawPort) : 9100;
      if (
        !Number.isInteger(resolvedPort) ||
        resolvedPort < 1 ||
        resolvedPort > 65535
      ) {
        return { error: "منفذ الطابعة غير صالح" };
      }
    } else {
      const hostError = validateSystemPrinterName(host);
      if (hostError) {
        return { error: hostError };
      }
    }

    const resolvedHost = host;
    const values = {
      venueId,
      name,
      role,
      host: resolvedHost,
      port: resolvedConnection === "local" ? 0 : resolvedPort,
      connectionType: resolvedConnection,
      autoPrint: resolvedConnection === "local",
    };
```

The existing duplicate-network lookup below reads `resolvedHost`; keep that reference working by keeping the `resolvedHost` constant above.

(`resolvedConnection` is still `const resolvedConnection: PrinterConnectionType = connectionType;`.)

In `testPrinter`, replace the whole local-rejection `if` and network try with:

```ts
  try {
    const data = await buildTestPrintBytes(printer.name);
    if (printer.connectionType === "local") {
      await printRawToWindowsPrinter(printer.host, data);
    } else {
      await printToPrinter({
        host: printer.host,
        port: printer.port,
        data,
      });
    }
    const target =
      printer.connectionType === "local" ? "نظام Windows" : printer.host;
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: true,
      detail: `اختبار ${printer.name} (${target})`,
    });
    return {
      ok: true,
      message: `تم إرسال صفحة الاختبار إلى ${printer.name}`,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : `تعذر الاتصال بالطابعة ${printer.name}`;
    recordSessionAudit(session, {
      venueId: printer.venueId,
      kind: "test",
      printerName: printer.name,
      success: false,
      detail,
    });
    return { error: detail };
  }
```

- [ ] **Step 10: Keep `PrintersAdmin` compiling with the removed helpers**

In `components/admin/PrintersAdmin.tsx`, change the import:

```ts
import {
  isExplicitWindowsPrinterName,
  validateAutoPrintHost,
} from "@/lib/print/checkout-print-mode";
```

to:

```ts
import {
  isExplicitWindowsPrinterName,
  validateSystemPrinterName,
} from "@/lib/print/checkout-print-mode";
```

and replace the derived value:

```ts
  const autoPrintError = validateAutoPrintHost(
    "local",
    autoPrintDraft,
    hostDraft,
  );
```

with:

```ts
  const autoPrintError =
    connectionDraft === "local" && autoPrintDraft
      ? validateSystemPrinterName(hostDraft)
      : null;
```

(This is temporary; Task 4 removes auto print.)

- [ ] **Step 11: Rewrite the action tests**

Update `lib/orders/pay-hold.test.ts`:
- In the `holder` object add `raw: vi.fn()`.
- Change the station printer fixture host from `"default"` to `"XP-80C"` (keep `connectionType: "local"`).
- Change the mock:

```ts
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: (...args: unknown[]) => holder.raw(...args),
}));
```

- In `reset()` add `holder.raw.mockReset(); holder.raw.mockResolvedValue(undefined);`
- In the settle test replace:

```ts
    expect(result).toMatchObject({ ok: true, browserPrint: true });
    if ("error" in result) throw new Error(result.error);
    expect(result.receiptHtml).toContain("نقدي");
```

with:

```ts
    expect(result).toMatchObject({ ok: true, printOk: true });
```

- In the quick-sale settle test replace `expect(settled).toMatchObject({ ok: true, browserPrint: true });` with `expect(settled).toMatchObject({ ok: true, printOk: true });`.
- Add this test inside `describe("payOrder deferred holds", ...)`:

```ts
  it("keeps the payment when direct receipt printing fails", async () => {
    holder.raw.mockRejectedValueOnce(new Error("Cannot open printer: XP-80C"));

    const result = await payOrder(1, "cash");

    expect(result).toMatchObject({
      ok: true,
      printOk: false,
      printError: "Cannot open printer: XP-80C",
    });
    expect(readOrder(1).status).toBe("paid");
  });
```

Create `app/actions/admin-printers.test.ts` with:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
  raw: vi.fn(),
  network: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({
    userId: 1,
    name: "مدير",
    role: "admin",
    venueId: null,
    mustChangePin: false,
  }),
}));
vi.mock("@/lib/print/windows-raw", () => ({
  printRawToWindowsPrinter: (...args: unknown[]) => holder.raw(...args),
}));
vi.mock("@/lib/print/network", () => ({
  printToPrinter: (...args: unknown[]) => holder.network(...args),
}));
vi.mock("@/lib/print/test-bytes", () => ({
  buildTestPrintBytes: async () => new Uint8Array([1, 2, 3]),
}));
vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE printers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      host TEXT NOT NULL DEFAULT '',
      port INTEGER NOT NULL DEFAULT 9100,
      connection_type TEXT NOT NULL DEFAULT 'network',
      auto_print INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE cashier_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id TEXT NOT NULL,
      name TEXT NOT NULL,
      printer_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id INTEGER,
      user_name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      kind TEXT NOT NULL,
      order_id INTEGER,
      printer_name TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      detail TEXT NOT NULL
    );
  `);
  holder.sqlite = sqlite;
  return { db: drizzle(sqlite, { schema }), getSqlite: () => sqlite };
});

import { testPrinter, upsertPrinter } from "@/app/actions/admin";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function printerRow() {
  return holder.sqlite!
    .prepare("SELECT * FROM printers ORDER BY id LIMIT 1")
    .get() as Record<string, unknown>;
}

beforeEach(() => {
  holder.sqlite!.exec("DELETE FROM cashier_stations; DELETE FROM printers;");
  holder.raw.mockReset();
  holder.network.mockReset();
  holder.raw.mockResolvedValue(undefined);
  holder.network.mockResolvedValue(undefined);
});

describe("upsertPrinter connection types", () => {
  it("accepts a local system printer for the kitchen", async () => {
    const result = await upsertPrinter(
      formData({
        name: "مطبخ مباشر",
        role: "kitchen",
        connectionType: "local",
        host: "XP-80C",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(printerRow()).toMatchObject({
      venue_id: null,
      host: "XP-80C",
      port: 0,
      connection_type: "local",
      auto_print: 1,
    });
  });

  it("rejects a local printer without a specific Windows queue", async () => {
    const result = await upsertPrinter(
      formData({
        name: "كاشير",
        role: "checkout",
        venueId: "restaurant",
        connectionType: "local",
        host: "default",
      }),
    );

    expect(result).toEqual({
      error: expect.stringContaining("طابعة Windows محددة"),
    });
    expect(
      holder.sqlite!.prepare("SELECT COUNT(*) AS count FROM printers").get(),
    ).toEqual({ count: 0 });
  });

  it("rejects an invalid network port", async () => {
    const result = await upsertPrinter(
      formData({
        name: "مطبخ",
        role: "kitchen",
        connectionType: "network",
        host: "192.168.1.50",
        port: "70000",
      }),
    );

    expect(result).toEqual({ error: "منفذ الطابعة غير صالح" });
  });

  it("links a local checkout printer to its cashier station", async () => {
    const result = await upsertPrinter(
      formData({
        name: "كاشير المطعم",
        role: "checkout",
        venueId: "restaurant",
        connectionType: "local",
        host: "XP-80C",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(
      holder.sqlite!
        .prepare("SELECT venue_id, name, active FROM cashier_stations")
        .get(),
    ).toEqual({ venue_id: "restaurant", name: "كاشير المطعم", active: 1 });
  });
});

describe("testPrinter", () => {
  it("prints a local test page through the Windows worker", async () => {
    holder.sqlite!
      .prepare(
        `INSERT INTO printers
          (id, venue_id, name, role, host, port, connection_type, auto_print, active)
         VALUES (1, 'restaurant', 'XP-80C', 'checkout', 'XP-80C', 0, 'local', 1, 1)`,
      )
      .run();

    const result = await testPrinter(1);

    expect(result).toEqual({
      ok: true,
      message: expect.stringContaining("XP-80C"),
    });
    expect(holder.raw).toHaveBeenCalledWith("XP-80C", expect.any(Uint8Array));
    expect(holder.network).not.toHaveBeenCalled();
  });

  it("returns the worker error for a local printer", async () => {
    holder.sqlite!
      .prepare(
        `INSERT INTO printers
          (id, venue_id, name, role, host, port, connection_type, auto_print, active)
         VALUES (1, 'restaurant', 'XP-80C', 'checkout', 'XP-80C', 0, 'local', 1, 1)`,
      )
      .run();
    holder.raw.mockRejectedValueOnce(
      new Error("Cannot open printer: XP-80C"),
    );

    expect(await testPrinter(1)).toEqual({
      error: "Cannot open printer: XP-80C",
    });
  });
});
```

- [ ] **Step 12: Run the affected tests and type-check**

Run:

```bash
npx vitest run lib/print/checkout-print-mode.test.ts lib/print/report-print.test.ts lib/orders/pay-hold.test.ts app/actions/admin-printers.test.ts
npx tsc --noEmit
```

Expected: all pass; no TypeScript errors. (`finish-checkout-print.ts` and the HTML builders still exist but are now unused; Task 3 deletes them.)

---

### Task 3: Delete the dead HTML/browser print code and port receipt-content tests

**Files:**
- Delete: `lib/print/finish-checkout-print.ts`
- Modify: `lib/print/receipts.ts`
- Modify: `lib/print/receipts.test.ts` (full rewrite)
- Modify: `lib/print/order-number.test.ts`

**Interfaces:**
- Consumes: the ESC/POS builders in `lib/print/escpos.ts`.
- Produces: `lib/print/receipts.ts` keeps only types + `checkoutReceiptMethodLabel`.

- [ ] **Step 1: Rewrite the receipt-content tests against ESC/POS**

Replace `lib/print/receipts.test.ts` with:

```ts
import iconv from "iconv-lite";
import { beforeAll, describe, expect, it } from "vitest";
import { nowSqlTripoli } from "@/lib/time/tripoli";
import { formatDateTime } from "@/lib/venues";
import type { CheckoutReceiptData } from "./receipts";

type BuildFn = typeof import("./escpos").buildCheckoutEscPos;

let buildCheckoutEscPos: BuildFn;

beforeAll(async () => {
  process.env.PRINTER_ARABIC_RASTER = "0";
  ({ buildCheckoutEscPos } = await import("./escpos"));
});

const base: CheckoutReceiptData = {
  venueName: "فاست بوس",
  orderId: 12,
  tableName: "بيع سريع",
  waiterName: null,
  cashierName: "كاشير",
  paymentMethod: "cash",
  paidAt: "2026-10-24 10:00:00",
  total: 10,
  lines: [{ name: "شاي", qty: 1, unitPrice: 10, lineTotal: 10 }],
};

function receiptText(data: CheckoutReceiptData) {
  return iconv.decode(Buffer.from(buildCheckoutEscPos(data)), "win1256");
}

describe("checkout receipt text", () => {
  it("prints the Libya wall clock, not UTC", () => {
    const paidAt = formatDateTime(
      nowSqlTripoli(new Date("2026-10-25T12:13:22Z")),
    );
    const text = receiptText({ ...base, paidAt });

    expect(text).toContain("2:13");
    expect(text).not.toContain("12:13");
  });

  it("prints the customer name and phone when attached", () => {
    const text = receiptText({
      ...base,
      customerName: "محمد سالم",
      customerPhone: "0910000000",
    });

    expect(text).toContain("العميل: محمد سالم");
    expect(text).toContain("الهاتف: 0910000000");
  });

  it("omits customer rows when no customer is attached", () => {
    const text = receiptText(base);

    expect(text).not.toContain("العميل:");
    expect(text).not.toContain("الهاتف:");
  });

  it("prints the configured payment method label", () => {
    const text = receiptText({
      ...base,
      paymentMethod: "custom",
      paymentMethodLabel: "آجل",
    });

    expect(text).toContain("الدفع: آجل");
  });
});
```

- [ ] **Step 2: Run the ported tests**

Run: `npx vitest run lib/print/receipts.test.ts`
Expected: PASS (the ESC/POS builder already prints these values).

- [ ] **Step 3: Remove the HTML half of `order-number.test.ts`**

Delete the import `import { buildCheckoutReceiptHtml } from "./receipts";`, the two `it(...)` blocks that start with `"prints the order number above the invoice number in HTML"` and `"omits the order number row when there is none"`, and the `HTML` wording in the describe title. Keep the two ESC/POS tests unchanged.

- [ ] **Step 4: Delete the browser print helper**

Run:

```bash
rm lib/print/finish-checkout-print.ts
```

- [ ] **Step 5: Strip HTML builders from `lib/print/receipts.ts`**

- Remove the import `import { receiptBrandBlock } from "./brand";`.
- Delete `escapeHtml`, `money`, `metaRow`, `shell`, `buildKitchenReceiptHtml` (from `function escapeHtml` through the end of `buildKitchenReceiptHtml`).
- Delete `buildCheckoutReceiptHtml`, `reportPaymentRows`, `reportSalesRows`, `buildDetailedSalesReportHtml`, `waitForImages`, and `printHtmlReceipt` (from `export function buildCheckoutReceiptHtml` to the end of the file).
- The file must end with `checkoutReceiptMethodLabel`.

- [ ] **Step 6: Confirm nothing references the deleted symbols**

Run:

```bash
rg -n "browserPrint|receiptHtml|printHtmlReceipt|finishCheckoutPrint|buildCheckoutReceiptHtml|buildDetailedSalesReportHtml|buildKitchenReceiptHtml|resolvePrinterAutoPrint|validateAutoPrintHost" --glob '!node_modules'
```

Expected: matches only under `docs/` (spec/worklog). No matches in `app/`, `components/`, or `lib/`.

- [ ] **Step 7: Type-check and run the print/action tests**

Run:

```bash
npx tsc --noEmit
npx vitest run lib/print lib/orders/pay-hold.test.ts app/actions/admin-printers.test.ts
```

Expected: PASS.

---

### Task 4: Two-type printers modal

**Files:**
- Modify: `components/admin/PrintersAdmin.tsx`
- Modify: `components/admin/PrintersAdmin.test.tsx` (full rewrite)
- Modify: `app/admin/(panel)/printers/page.tsx`

**Interfaces:**
- Consumes: `getSystemPrinters`, `upsertPrinter`, `isExplicitWindowsPrinterName`.
- Produces: form fields `name`, `role`, `venueId?`, `connectionType` (`local`/`network`), `host`, `port`; no `autoPrint` field.

- [ ] **Step 1: Rewrite the component tests**

Replace `components/admin/PrintersAdmin.test.tsx` with:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSystemPrinters, upsertPrinter } from "@/app/actions/admin";
import { ToastProvider } from "@/components/ToastProvider";
import { PrintersAdmin } from "./PrintersAdmin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/admin", () => ({
  deletePrinter: vi.fn(),
  getSystemPrinters: vi.fn(),
  setPrinterActive: vi.fn(),
  upsertPrinter: vi.fn(),
}));

const systemPrinter = {
  id: 1,
  venueId: "restaurant" as const,
  name: "كاشير المطعم",
  role: "checkout",
  host: "XP-80C",
  port: 0,
  connectionType: "local",
  active: true,
};

const legacyLocalPrinter = {
  ...systemPrinter,
  host: "default",
};

const networkPrinter = {
  id: 2,
  venueId: null,
  name: "مطبخ",
  role: "kitchen",
  host: "192.168.1.56",
  port: 9100,
  connectionType: "network",
  active: true,
};

const systemPrinters = [
  {
    name: "XP-80C",
    driver: "XP-80C",
    portName: "USB004",
    isDefault: true,
    host: null,
    port: null,
  },
  {
    name: "kitchen",
    driver: "XP-80C",
    portName: "kitchen",
    isDefault: false,
    host: "192.168.1.56",
    port: 9100,
  },
];

function renderPrinters(printers = [systemPrinter]) {
  return render(
    <ToastProvider>
      <PrintersAdmin venueId="restaurant" printers={printers} />
    </ToastProvider>,
  );
}

async function openEdit(container: HTMLElement) {
  fireEvent.click(screen.getByTitle("تعديل"));
  return await waitFor(() => {
    const select = container.querySelector(
      'select[name="host"]',
    ) as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    // getSystemPrinters() resolves asynchronously; wait for the options so
    // fireEvent.change on a known queue cannot race the empty list.
    expect(
      select!.querySelector('option[value="XP-80C"]'),
    ).toBeTruthy();
    return select as HTMLSelectElement;
  });
}

beforeEach(() => {
  vi.mocked(upsertPrinter).mockReset();
  vi.mocked(upsertPrinter).mockResolvedValue({ ok: true });
  vi.mocked(getSystemPrinters).mockReset();
  vi.mocked(getSystemPrinters).mockResolvedValue({
    printers: systemPrinters,
  });
});

describe("PrintersAdmin connection types", () => {
  it("uses only the two connection types and never mentions Chrome or auto print", async () => {
    const { container } = renderPrinters();

    await openEdit(container);

    const connection = container.querySelector(
      'select[name="connectionType"]',
    ) as HTMLSelectElement;
    expect(
      Array.from(connection.options).map((option) => option.value),
    ).toEqual(["local", "network"]);
    expect(container.querySelector('input[name="autoPrint"]')).toBeNull();
    expect(screen.queryByText(/Chrome/)).toBeNull();
  });

  it("lists the installed Windows printers", async () => {
    const { container } = renderPrinters();

    const select = await openEdit(container);
    const values = Array.from(select.options).map((option) => option.value);

    expect(values).toContain("XP-80C");
    expect(values).toContain("kitchen");
  });

  it("submits the selected system printer as a local connection", async () => {
    const { container } = renderPrinters();

    const select = await openEdit(container);
    fireEvent.change(select, { target: { value: "kitchen" } });
    fireEvent.click(screen.getByText("حفظ التعديلات"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("connectionType")).toBe("local");
    expect(formData.get("host")).toBe("kitchen");
    expect(formData.get("port")).toBe("0");
  });

  it("blocks saving until a specific Windows queue is chosen", async () => {
    const { container } = renderPrinters([legacyLocalPrinter]);

    const select = await openEdit(container);
    expect(select.value).toBe("");
    expect(
      screen.getAllByText(/اختر طابعة Windows محددة/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("حفظ التعديلات"));
    expect(upsertPrinter).not.toHaveBeenCalled();
  });

  it("submits host and port for a network printer", async () => {
    const { container } = renderPrinters([networkPrinter]);

    fireEvent.click(screen.getByTitle("تعديل"));
    const host = (await waitFor(() => {
      const input = container.querySelector(
        'input[name="host"]',
      ) as HTMLInputElement | null;
      expect(input).toBeTruthy();
      return input as HTMLInputElement;
    })) as HTMLInputElement;
    const port = container.querySelector(
      'input[name="port"]',
    ) as HTMLInputElement;

    fireEvent.change(host, { target: { value: "192.168.1.90" } });
    fireEvent.change(port, { target: { value: "9101" } });
    fireEvent.click(screen.getByText("حفظ التعديلات"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("connectionType")).toBe("network");
    expect(formData.get("host")).toBe("192.168.1.90");
    expect(formData.get("port")).toBe("9101");
  });

  it("lets a kitchen printer use the system printer connection", async () => {
    const { container } = renderPrinters([]);

    fireEvent.click(screen.getByText("إضافة طابعة"));
    const role = container.querySelector(
      'select[name="role"]',
    ) as HTMLSelectElement;
    fireEvent.change(role, { target: { value: "kitchen" } });

    const connection = container.querySelector(
      'select[name="connectionType"]',
    ) as HTMLSelectElement;
    expect(
      Array.from(connection.options).map((option) => option.value),
    ).toEqual(["local", "network"]);

    const select = await waitFor(() => {
      const element = container.querySelector(
        'select[name="host"]',
      ) as HTMLSelectElement | null;
      expect(element).toBeTruthy();
      expect(
        element!.querySelector('option[value="XP-80C"]'),
      ).toBeTruthy();
      return element as HTMLSelectElement;
    });
    fireEvent.change(select, { target: { value: "XP-80C" } });
    fireEvent.click(screen.getByText("إضافة"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("role")).toBe("kitchen");
    expect(formData.get("connectionType")).toBe("local");
    expect(formData.get("host")).toBe("XP-80C");
  });

  it("warns in the table about a legacy default-queue printer", () => {
    renderPrinters([legacyLocalPrinter]);

    expect(screen.getByText("تحتاج تحديد")).toBeInTheDocument();
    expect(screen.getByText("اختر طابعة Windows محددة")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run components/admin/PrintersAdmin.test.tsx`
Expected: FAIL — the modal still has the auto-print checkbox, three connection labels, and the network-only kitchen rule.

- [ ] **Step 3: Update the modal state and handlers**

In `components/admin/PrintersAdmin.tsx`:

- Remove `autoPrintDraft`/`setAutoPrintDraft`.
- Change the connection default:

```ts
  const [connectionDraft, setConnectionDraft] = useState<"network" | "local">(
    "local",
  );
```

- In `openPrinterModal`, replace:

```ts
    const localPrinterName =
      printer && isLocal && printer.host !== "default" ? printer.host : "";
```

with:

```ts
    const localPrinterName =
      printer && isLocal && isExplicitWindowsPrinterName(printer.host)
        ? printer.host
        : "";
```

and delete `setAutoPrintDraft(printer?.autoPrint ?? false);`.

- Replace `changeRole` with:

```ts
  function changeRole(value: string) {
    setRoleDraft(value);
  }
```

- Replace `changeConnection` with:

```ts
  function changeConnection(value: "network" | "local") {
    setConnectionDraft(value);
    setHostDraft("");
    setPortDraft(value === "local" ? "0" : "9100");
  }
```

- Replace the derived values near `const showVenue`:

```ts
  const supportsKitchenRole = supportsKitchen(roleDraft);
  const autoPrintError = validateAutoPrintHost(
    "local",
    autoPrintDraft,
    hostDraft,
  );
  const localAutoPrintReady = (printer: PrinterRow) =>
    printer.autoPrint && isExplicitWindowsPrinterName(printer.host);
```

with:

```ts
  const systemPrinterMissing =
    connectionDraft === "local" &&
    !isExplicitWindowsPrinterName(hostDraft);
```

(Delete `supportsKitchenRole`; it is no longer used. Keep `supportsKitchen` for `kitchenPrinters`.)

- Update the import to only:

```ts
import { isExplicitWindowsPrinterName } from "@/lib/print/checkout-print-mode";
```

- Remove `autoPrint` from the `PrinterRow` type.

- [ ] **Step 4: Update the table rows**

Replace the connection `<td>` with:

```tsx
                    <td>
                      {printer.connectionType === "local" ? (
                        isExplicitWindowsPrinterName(printer.host) ? (
                          <span className="badge badge-success badge-soft badge-sm">
                            نظام Windows
                          </span>
                        ) : (
                          <span className="badge badge-warning badge-soft badge-sm">
                            تحتاج تحديد
                          </span>
                        )
                      ) : (
                        <span className="badge badge-ghost badge-sm">
                          شبكة
                        </span>
                      )}
                    </td>
```

Replace the address `<td>` with:

```tsx
                    <td className="font-mono text-xs sm:text-sm">
                      {printer.connectionType === "local"
                        ? isExplicitWindowsPrinterName(printer.host)
                          ? `Windows — ${printer.host}`
                          : "اختر طابعة Windows محددة"
                        : `${printer.host}:${printer.port}`}
                    </td>
```

Replace the test `<td>` with:

```tsx
                    <td>
                      {printer.active ? (
                        <TestPrintButton printerId={printer.id} />
                      ) : (
                        "-"
                      )}
                    </td>
```

- [ ] **Step 5: Update the modal fields**

- Connection select: remove the `!supportsKitchenRole` conditional and use:

```tsx
              <option value="local">طابعة النظام (Windows)</option>
              <option value="network">طابعة الشبكة (IP)</option>
```

with helper text:

```tsx
            <span className="label-text-alt mt-2 text-base-content/45">
              {connectionDraft === "local"
                ? "تُرسل الفاتورة مباشرة ESC/POS إلى الطابعة على جهاز Fast POS — بدون نافذة طباعة في المتصفح."
                : "اتصال مباشر عبر IP والمنفذ (افتراضي 9100)."}
            </span>
```

- Network fields: keep the IP and port inputs. Use the label `المنفذ` (drop the 9100-only wording is optional; keep `المنفذ (افتراضي 9100)`).
- Local fields:
  - Replace the select's empty option text with `اختر طابعة Windows...` (never mention Chrome).
  - Add `required` to the `select` and the manual `input`.
  - Replace the helper text with:

```tsx
                <span className="label-text-alt mt-2 text-base-content/45">
                  يجب أن تكون الطابعة مثبتة على جهاز Fast POS وتدعم ESC/POS.
                </span>
```

  - Replace the `autoPrintError` warning with:

```tsx
                {systemPrinterMissing ? (
                  <span className="label-text-alt mt-1 text-warning">
                    اختر طابعة Windows محددة — الطابعة الافتراضية تتبع حساب الخدمة
                    وقد تطبع على طابعة أخرى.
                  </span>
                ) : null}
```

  - Delete the auto-print `<label>` checkbox and both summary `<div>` blocks.
  - Keep `<input type="hidden" name="port" value="0" />`.
- Submit button:

```tsx
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || systemPrinterMissing}
            >
```

- Update the section subtitle to:

```tsx
                  طباعة مباشرة ESC/POS — نظام Windows أو شبكة IP
```

- [ ] **Step 6: Stop passing `autoPrint` from the page**

In `app/admin/(panel)/printers/page.tsx`, delete the line:

```ts
          autoPrint: p.autoPrint,
```

- [ ] **Step 7: Run the component tests and type-check**

Run:

```bash
npx vitest run components/admin/PrintersAdmin.test.tsx
npx tsc --noEmit
```

Expected: PASS (7 tests), no type errors.

- [ ] **Step 8: Verify the modal in a browser**

Run `npm run dev`, open `/admin/printers`, and check:
1. Add a printer: connection offers exactly **طابعة النظام (Windows)** and **طابعة الشبكة (IP)**.
2. System printer mode lists `XP-80C` and `kitchen`; Save is disabled until one is selected.
3. Kitchen role offers both connection types.
4. A legacy `default` row shows **تحتاج تحديد** and the fixed warning text.
5. No “Chrome” or “طباعة تلقائية” text anywhere on the page.

---

### Task 5: Full verification on the installed build

**Files:** none (verification only; the benchmark script is temporary and deleted afterwards).

- [ ] **Step 1: Run the whole suite, type-check, and production build**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, no type errors, Next build succeeds. Payload tracing must keep the worker script (it is a string literal inside the server module; no external file).

- [ ] **Step 2: Grep for removed concepts**

```bash
rg -n "browserPrint|receiptHtml|printHtmlReceipt|finishCheckoutPrint|buildCheckoutReceiptHtml|buildDetailedSalesReportHtml|resolvePrinterAutoPrint|validateAutoPrintHost" --glob '!node_modules'
```

Expected: only `docs/` matches (spec/worklog).

- [ ] **Step 3: Benchmark the warm worker (no paper if the queue is invalid; one tiny print for the real queue)**

Create `scripts/bench-raw-print.ts` temporarily:

```ts
import { printRawToWindowsPrinter } from "../lib/print/windows-raw";

const printer = process.argv[2] ?? "XP-80C";
const bytes = new Uint8Array([0x1b, 0x40, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);

const startFirst = performance.now();
await printRawToWindowsPrinter(printer, bytes);
const first = performance.now() - startFirst;

const times: number[] = [];
for (let i = 0; i < 4; i += 1) {
  const start = performance.now();
  await printRawToWindowsPrinter(printer, bytes);
  times.push(performance.now() - start);
}

console.log({ firstMs: Math.round(first), warmMs: times.map((ms) => Math.round(ms)) });
```

Run:

```bash
node --experimental-strip-types scripts/bench-raw-print.ts XP-80C
```

Expected: `firstMs` ≈ 500; every `warmMs` ≤ 50. Delete the script afterwards:

```bash
rm scripts/bench-raw-print.ts
```

- [ ] **Step 4: Verify the invalid-queue error path (no paper)**

Run the integration test again:

```bash
npx vitest run lib/print/windows-raw.integration.test.ts
```

Expected: PASS; rejects with `Cannot open printer`.

- [ ] **Step 5: Real admin test print**

In the browser, on `/admin/printers`, press **اختبار** for `XP-80C`. Expected: the test page prints immediately with no browser dialog.

- [ ] **Step 6: Build and install the update**

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipNpm
```

Expected: `release/installer/Fast-POS-Setup-0.1.0.exe` is rebuilt. Install it (the owner approves UAC) and start the service from the Start Menu.

- [ ] **Step 7: End-to-end timing on the installed build**

1. Open the cashier screen, start/open a shift if needed.
2. Ring a quick sale with an item that prints a kitchen ticket.
3. Confirm the kitchen ticket and the customer receipt arrive within ~1 s of each other (previously 3–4 s apart).
4. Turn the receipt printer off and ring another sale: payment succeeds, an Arabic error toast appears, and the receipt reprints from مبيعاتي after the printer is back on.
5. Stop the Fast POS service, then check Task Manager has no leftover `powershell.exe` process holding the worker (stdin-EOF exit works).

---

### Task 6: Documentation, worklog, and memory

**Files:**
- Modify: `PROJECT_INDEX.md`
- Modify: `README.md`
- Create: `docs/worklog/2026-10-31-direct-escpos-printing.md`
- Create: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\direct-escpos-printing.md`
- Modify: `C:\Users\zakaria\.qoder\projects\C--Users-zakaria-fast-pos\memory\MEMORY.md`

- [ ] **Step 1: Update `PROJECT_INDEX.md`**

Replace the sentence in the **Printing** section that describes `local + auto_print` and HTML with:

```markdown
Checkout receipt prints «رقم الطلب» (per-shift `orders.order_no`) above the global «رقم الفاتورة #id» in ESC/POS (`lib/print/escpos.ts`); reprints use the stored number. `printer.connectionType` has exactly two values: `local` → raw ESC/POS through the Windows spooler via one persistent PowerShell worker (`lib/print/windows-raw.ts`, winspool P/Invoke loaded once, tab-delimited stdin protocol, 15 s timeout, respawn after crash); `network` → raw ESC/POS over TCP. There is no browser/Chrome print path. Shift and admin reports use the same two transports (`report-print.ts`); a local row whose stored queue is empty/`default` is rejected with an Arabic fix instruction because the WinSW service runs as LocalSystem and its default queue is unreliable.
```

Update the category-modal paragraph to say USB/WSD printers are disabled in the **category** picker because that picker creates shared network kitchen printers, while a USB kitchen printer can still be added as a **system printer** on the printers page. Add a gotcha line:

```markdown
- Printing has no browser fallback: `local` requires an explicit Windows queue name (`printRawToWindowsPrinter` rejects `default`/empty), the worker is a `globalThis` singleton so HMR does not duplicate it, and a legacy `default` row shows «تحتاج تحديد» instead of being rewritten.
```

- [ ] **Step 2: Update `README.md`**

Replace the whole `## الطابعات` section (lines 175–213) with:

```markdown
## الطابعات

### نوعا الاتصال
| النوع | من أين تطبع | الإعداد |
|--------|-------------|--------|
| **طابعة النظام (Windows)** | جهاز Fast POS → طابور Windows مباشرةً RAW ESC/POS | اختر اسم الطابعة المثبتة على جهاز Fast POS |
| **طابعة الشبكة (IP)** | جهاز Fast POS → IP الطابعة | IP ثابت + منفذ 9100 |

- كل الطباعة مباشرة ESC/POS — **لا توجد نافذة طباعة متصفح**.
- طابعة المطبخ قد تكون نظام Windows أو شبكة.
- زر **اختبار الطباعة** يعمل للنوعين.
- الطابعة الافتراضية في Windows غير كافية: اختر الطابعة بالاسم الصريح. الصفوف القديمة المسجلة `default` تظهر «تحتاج تحديد» وتُرفض طباعتها حتى تُعدّل.
- طابعة النظام يجب أن تكون طابعة إيصالات تدعم ESC/POS (وليس طابعة حبر عادية أو PDF).

### ربط تصنيفات المطبخ
عند إنشاء/تعديل **تصنيف** من الإدارة ← الأصناف، حقل «طابعة المطبخ» يقرأ طابعات الشبكة المثبتة على جهاز Fast POS:
- طابعة مثبتة على منفذ **TCP/IP** تظهر باسمها؛ عند حفظ التصنيف تُضاف تلقائياً كطابعة مطبخ شبكية أو تُعاد استخدامها.
- طابعات **USB/WSD** تظهر معطّلة في هذا المنتقي لأن الربط ينشئ طابعة شبكة؛ أضف طابعة USB كمحطة **طابعة النظام** من صفحة الطابعات ثم اربط التصنيف بها.

### إعداد عام
1. من الإدارة ← **الطابعات**: أضف طابعات المطبخ وطابعة **فاتورة كاشير** لكل قسم (مطعم / كافيه)، واختر النوع المناسب.
2. **اختبار طباعة** للتأكد من وصول الصفحة.
3. من **الأصناف**: اربط **التصنيفات** بطابعات المطبخ.
4. الموظف يختار **مطعم** أو **كافيه** من الصفحة الرئيسية — الطباعة تلقائية على طابعة ذلك القسم.

### عند فشل الطباعة (للموظفين)
1. هل الطابعة تعمل وفيها ورق؟
2. هل جهاز Fast POS يعمل؟
3. أعد تشغيل الطابعة → الراوتر → جهاز Fast POS.

الدفع يُسجَّل حتى لو فشلت الطباعة — ستظهر رسالة تحذير واضحة، ويمكن إعادة الطباعة من **مبيعاتي**.

لا حاجة لوكيل طباعة؛ `tools/cashier-print-agent` قديم وغير مستخدم.
```

- [ ] **Step 3: Write the worklog**

Create `docs/worklog/2026-10-31-direct-escpos-printing.md` with these sections and the measured numbers:

```markdown
# Direct ESC/POS printing from Windows system printers — 2026-10-31

## Problem
The customer receipt arrived 3–4 s after the kitchen ticket. Kitchen tickets use raw
TCP; the Windows receipt printer used either the Chrome dialog or a per-print
PowerShell process that ran a CIM printer enumeration (~0.9 s), compiled the winspool
P/Invoke type (~0.1 s), and started a process (~0.5 s).

## Change
- `lib/print/windows-raw.ts`: one persistent hidden PowerShell worker started with
  `-EncodedCommand` (UTF-16LE base64). It loads `RawPrinterHelper` once, prints `READY`,
  then reads `PRINT<TAB><base64 name><TAB><data path>` lines and answers `OK` or
  `ERR<TAB><message>`. Node serializes prints through a promise queue, keeps the last
  4 KB of stderr, uses 15 s timeouts, and kills/respawns on failure. State lives on
  `globalThis`; injected worker factories are isolated per test.
- Routing: `local → windows`, `network → network`. `default`/empty queue names are
  rejected (`validateSystemPrinterName`).
- Removed the browser path: `finish-checkout-print.ts`, `receiptHtml`/`browserPrint`
  from every action, HTML builders and `printHtmlReceipt` from `receipts.ts`, the audit
  special case, and the Chrome fallbacks in five client components.
- Admin: `upsertPrinter` accepts exactly `local`/`network`, requires an explicit queue
  for local, stores `port = 0` and `autoPrint = true` for data coherence, and allows
  kitchen local printers. `testPrinter` uses the worker for local rows.
- Printers modal: two connection types, no auto-print checkbox, no Chrome wording.
- Schema unchanged; `auto_print` is retained but unread. Legacy `default` rows are
  never rewritten and show «تحتاج تحديد».

## Measurements (target Windows 10 PC)
- Old per-print path: ~1.5–2.5 s plus ~0.5 s process start.
- New worker: first print ~0.5 s (spawn + Add-Type), warm 8–16 ms; benchmark run
  recorded: `{ firstMs: <n>, warmMs: [...] }`.
- Installed build: kitchen ticket and customer receipt < 1 s apart.

## Verification
- `npm test`, `npx tsc --noEmit`, `npm run build`.
- Invalid queue returns `Cannot open printer` without paper.
- Admin test print to `XP-80C`.
- Printer-off sale: payment succeeds, Arabic error, reprint from مبيعاتي.
- No orphan `powershell.exe` after stopping the service.

## Pitfalls
- Do not use `-File` for the worker script; the script travels as an encoded command, so
  there is no temp script path or quoting problem.
- Keep the worker on `globalThis`; otherwise Next HMR leaks workers in development.
- A local row with `host = default` cannot be safely resolved under LocalSystem.
```

Fill `<n>` and the benchmark array with the Task 5 numbers.

- [ ] **Step 4: Save project memory**

Create `memory/direct-escpos-printing.md` with frontmatter (`name: direct-escpos-printing`, `description:` one line, `metadata.type: project`) and content:

```markdown
# Direct ESC/POS printing (2026-10-31)

Printer connections are now exactly two: `local` = Windows system printer (raw ESC/POS
through a persistent PowerShell/winspool worker) and `network` = IP:port TCP. The
browser/Chrome print path and `auto_print` checkbox are gone; `auto_print` remains in
the schema but is unread.

**Why:** the customer receipt lagged the kitchen ticket by 3–4 s because every Windows
print spawned PowerShell, enumerated printers over CIM, and compiled P/Invoke.
**How to apply:** never reintroduce a browser print fallback or an implicit "default"
queue; local rows must name the queue explicitly. Legacy `default` rows show «تحتاج
تحديد» and are left untouched. Print failures never block payment — reprint from
مبيعاتي. See `docs/worklog/2026-10-31-direct-escpos-printing.md`.
```

Add to `memory/MEMORY.md`:

```markdown
- [Direct ESC/POS printing](direct-escpos-printing.md) — Two printer types only (Windows system worker / network IP); no browser print path; locked 2026-10-31.
```

- [ ] **Step 5: Final check**

Run `npm test` once more and confirm the worklog numbers match the benchmark output.

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| Persistent worker + protocol + timeouts + respawn | Task 1 |
| Routing only windows/network, validators | Task 2 |
| Browser path removal (actions, clients, audit, docs) | Task 2, Task 3 |
| Admin actions (two types, test print both) | Task 2 |
| Two-type printers modal | Task 4 |
| Data compatibility / legacy rows | Task 2 (validation), Task 4 (warning) |
| Error handling and no rollback | Task 2 (pay-hold failure test) |
| Tests (worker, routing, actions, UI, ESC/POS content) | Tasks 1–4 |
| Manual verification, installer, timing | Task 5 |
| Documentation + worklog + memory | Task 6 |

**Placeholder scan:** the only values filled during execution are the benchmark numbers in the worklog (explicitly marked in Task 6 Step 3), which Task 5 produces. No TBD implementation steps.

**Type consistency:** `CheckoutPrintMode` is `"windows" | "network"` everywhere; `validateSystemPrinterName` is the only queue validator; `RawPrintOptions` uses `createWorker`/`platform`/`timeoutMs`; `PrinterRow` no longer carries `autoPrint` after Task 4; `printCheckoutReceipt` returns only `printOk`/`printError`.
