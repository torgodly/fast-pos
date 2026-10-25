import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { printRawToWindowsPrinter } from "./windows-raw";

async function makeTempRoot() {
  return mkdtemp(path.join(os.tmpdir(), "fastpos-raw-test-"));
}

describe("printRawToWindowsPrinter", () => {
  it("passes the exact receipt bytes and printer name to the raw printer", async () => {
    const tempRoot = await makeTempRoot();
    const data = new Uint8Array([0x1b, 0x40, 0x00, 0xff, 0x0a]);
    let seenName = "";
    let seenBytes: number[] = [];

    try {
      await printRawToWindowsPrinter("XP-80C", data, {
        tempDir: tempRoot,
        runPowerShell: async (_script, env) => {
          seenName = String(env.FASTPOS_PRINTER_NAME ?? "");
          const file = String(env.FASTPOS_PRINT_FILE ?? "");
          seenBytes = [...(await readFile(file))];
          return "OK:XP-80C";
        },
      });

      expect(seenName).toBe("XP-80C");
      expect(seenBytes).toEqual([...data]);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("removes the temporary data when raw printing fails", async () => {
    const tempRoot = await makeTempRoot();

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array([1, 2, 3]), {
          tempDir: tempRoot,
          runPowerShell: async () => {
            throw new Error("printer offline");
          },
        }),
      ).rejects.toThrow("printer offline");

      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects empty print data before spawning PowerShell", async () => {
    const tempRoot = await makeTempRoot();
    let invoked = false;

    try {
      await expect(
        printRawToWindowsPrinter("XP-80C", new Uint8Array(), {
          tempDir: tempRoot,
          runPowerShell: async () => {
            invoked = true;
            return "";
          },
        }),
      ).rejects.toThrow("بيانات الطباعة فارغة");

      expect(invoked).toBe(false);
      expect(await readdir(tempRoot)).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
