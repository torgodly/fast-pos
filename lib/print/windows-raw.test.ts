import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  printRawToWindowsPrinter,
  type RawPrintWorker,
} from "./windows-raw";

async function makeTempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "fastpos-raw-test-"));
}

type FakeOptions = {
  ready?: boolean;
  readyDelayMs?: number;
  exitDelayMs?: number;
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

  const fireExit = () => {
    const listener = listeners.exit;
    listeners.exit = undefined;
    listener?.();
  };

  const worker: RawPrintWorker = {
    stdin,
    stdout,
    stderr,
    kill: () => {
      killed = true;
      if (options.exitDelayMs === undefined) fireExit();
      else setTimeout(fireExit, options.exitDelayMs);
    },
    onExit: (listener) => {
      listeners.exit = listener;
    },
    onError: (listener) => {
      listeners.error = listener;
    },
    onStdinError: (listener) => {
      stdin.on("error", listener);
    },
  };

  const announceReady = () => stdout.write("READY\n");
  if (options.ready !== false) {
    if (options.readyDelayMs === undefined) announceReady();
    else setTimeout(announceReady, options.readyDelayMs);
  }

  stdin.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      commands.push(line);
      const reply = options.onCommand ? options.onCommand(line) : "OK";
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
    emitStdinError: (error: Error) => stdin.emit("error", error),
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
    const silent = fakeWorker({ onCommand: () => null, exitDelayMs: 15 });
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

  it("ignores a stale exit that lands during the next worker's handshake", async () => {
    const tempRoot = await makeTempRoot();
    // The timed-out worker's exit arrives 10 ms after kill(), while the second
    // worker is still in its 60 ms READY handshake. It must not abort it.
    const stale = fakeWorker({ onCommand: () => null, exitDelayMs: 10 });
    const next = fakeWorker({ readyDelayMs: 60, onCommand: () => "OK" });
    let spawns = 0;
    const createWorker = () => {
      spawns += 1;
      return spawns === 1 ? stale.worker : next.worker;
    };
    const options = { tempDir: tempRoot, createWorker, timeoutMs: 150 };

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options),
      ).rejects.toThrow(/مهلة/);
      expect(stale.isKilled()).toBe(true);

      await printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options);

      expect(spawns).toBe(2);
      expect(next.isKilled()).toBe(false);
      expect(next.commands).toHaveLength(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects when the worker never reports READY and kills it", async () => {
    const tempRoot = await makeTempRoot();
    const mute = fakeWorker({ ready: false, exitDelayMs: 5 });
    let spawns = 0;
    const options = {
      tempDir: tempRoot,
      createWorker: () => {
        spawns += 1;
        return mute.worker;
      },
      timeoutMs: 50,
    };

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options),
      ).rejects.toThrow("تعذر تشغيل خدمة الطباعة على Windows");
      expect(spawns).toBe(1);
      expect(mute.isKilled()).toBe(true);
      expect(mute.commands).toHaveLength(0);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("kills a worker whose first line is not READY and respawns", async () => {
    const tempRoot = await makeTempRoot();
    const poisoned = fakeWorker({ ready: false, exitDelayMs: 20 });
    poisoned.stdout.write("WARNING: unexpected banner\n");
    const healthy = fakeWorker({ readyDelayMs: 25, onCommand: () => "OK" });
    let spawns = 0;
    const createWorker = () => {
      spawns += 1;
      return spawns === 1 ? poisoned.worker : healthy.worker;
    };
    const options = { tempDir: tempRoot, createWorker, timeoutMs: 200 };

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options),
      ).rejects.toThrow(/استجابة غير متوقعة من الطباعة/);
      expect(poisoned.isKilled()).toBe(true);
      expect(poisoned.commands).toHaveLength(0);

      // The stale exit of the poisoned worker (20 ms) overlaps this handshake.
      await printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options);

      expect(spawns).toBe(2);
      expect(healthy.commands).toHaveLength(1);
      expect(healthy.isKilled()).toBe(false);
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
      exitDelayMs: 20,
      onCommand: () => {
        setTimeout(() => crashing.exit(), 0);
        return null;
      },
    });
    const healthy = fakeWorker({ readyDelayMs: 30, onCommand: () => "OK" });
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

      // kill() of the already-dead worker emits a second, stale exit ~20 ms
      // later, while the healthy worker is still handshaking.
      await printRawToWindowsPrinter("XP-80C", new Uint8Array([1]), options);
      expect(spawns).toBe(2);
      expect(healthy.isKilled()).toBe(false);
      expect(healthy.commands).toHaveLength(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects a pending print when stdin errors and respawns", async () => {
    const tempRoot = await makeTempRoot();
    const stalled = fakeWorker({ onCommand: () => null, exitDelayMs: 5 });
    const healthy = fakeWorker({ onCommand: () => "OK" });
    let spawns = 0;
    const createWorker = () => {
      spawns += 1;
      return spawns === 1 ? stalled.worker : healthy.worker;
    };
    const options = { tempDir: tempRoot, createWorker, timeoutMs: 1000 };

    try {
      const pending = printRawToWindowsPrinter(
        "XP-80C",
        new Uint8Array([1]),
        options,
      );
      await vi.waitFor(() => expect(stalled.commands).toHaveLength(1));

      stalled.emitStdinError(new Error("EPIPE: broken pipe"));

      await expect(pending).rejects.toThrow("EPIPE: broken pipe");
      expect(stalled.isKilled()).toBe(true);

      await printRawToWindowsPrinter("XP-80C", new Uint8Array([2]), options);
      expect(spawns).toBe(2);
      expect(healthy.isKilled()).toBe(false);
      expect(healthy.commands).toHaveLength(1);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("round-trips an Arabic printer name through the tab-delimited protocol", async () => {
    const tempRoot = await makeTempRoot();
    const fake = fakeWorker({ onCommand: () => "OK" });
    const name = "طابعة المنظومة";

    try {
      await printRawToWindowsPrinter(name, new Uint8Array([1]), {
        tempDir: tempRoot,
        createWorker: () => fake.worker,
      });

      const [command] = fake.commands;
      expect(command).toMatch(/^PRINT\t/);
      expect(decodeName(command)).toBe(name);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
