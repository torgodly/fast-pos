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
