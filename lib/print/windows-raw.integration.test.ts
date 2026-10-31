import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { printRawToWindowsPrinter } from "./windows-raw";

describe.skipIf(process.platform !== "win32")(
  "Windows raw print PowerShell integration",
  () => {
    it("reports a missing printer instead of silently dropping the receipt", async () => {
      // A non-ASCII temp path proves the worker reads the print command and the
      // data file as UTF-8: a mangled path would fail in File.ReadAllBytes with
      // "Could not find file" instead of reaching OpenPrinter.
      const tempRoot = mkdtempSync(path.join(os.tmpdir(), "fastpos-raw-int-"));
      const tempDir = path.join(tempRoot, "طابعة الاختبار");
      mkdirSync(tempDir);

      try {
        await expect(
          printRawToWindowsPrinter(
            "__fastpos_missing_printer__",
            new Uint8Array([0x1b, 0x40]),
            { tempDir },
          ),
        ).rejects.toThrow(/Cannot open printer/);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    }, 30_000);
  },
);
