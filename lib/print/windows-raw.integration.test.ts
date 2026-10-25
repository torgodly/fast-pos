import { describe, expect, it } from "vitest";
import { printRawToWindowsPrinter } from "./windows-raw";

describe.skipIf(process.platform !== "win32")(
  "Windows raw print PowerShell integration",
  () => {
    it("reports a missing printer instead of silently dropping the receipt", async () => {
      await expect(
        printRawToWindowsPrinter(
          "__fastpos_missing_printer__",
          new Uint8Array([0x1b, 0x40]),
        ),
      ).rejects.toThrow(/Printer not found/);
    }, 30_000);
  },
);
