import { describe, expect, it } from "vitest";
import {
  resolveCheckoutPrintMode,
  resolvePrinterAutoPrint,
  validateAutoPrintHost,
} from "./checkout-print-mode";

describe("resolveCheckoutPrintMode", () => {
  it("uses the Windows queue for a local auto-print printer with an explicit queue", () => {
    expect(
      resolveCheckoutPrintMode({
        connectionType: "local",
        autoPrint: true,
        host: "XP-80C",
      }),
    ).toBe("windows");
  });

  it("falls back to Chrome when auto print has no explicit Windows queue", () => {
    expect(
      resolveCheckoutPrintMode({
        connectionType: "local",
        autoPrint: true,
        host: "default",
      }),
    ).toBe("browser");
    expect(
      resolveCheckoutPrintMode({
        connectionType: "local",
        autoPrint: true,
        host: "  ",
      }),
    ).toBe("browser");
  });

  it("keeps the Chrome dialog for a local printer without auto print", () => {
    expect(
      resolveCheckoutPrintMode({
        connectionType: "local",
        autoPrint: false,
        host: "default",
      }),
    ).toBe("browser");
  });

  it("keeps network printers on the direct TCP path", () => {
    expect(
      resolveCheckoutPrintMode({
        connectionType: "network",
        autoPrint: true,
        host: "192.168.1.56",
      }),
    ).toBe("network");
    expect(
      resolveCheckoutPrintMode({
        connectionType: "network",
        autoPrint: false,
        host: "192.168.1.56",
      }),
    ).toBe("network");
  });
});

describe("validateAutoPrintHost", () => {
  it("rejects auto print without an explicit Windows printer name", () => {
    expect(validateAutoPrintHost("local", true, "")).toMatch(/Windows/);
    expect(validateAutoPrintHost("local", true, "default")).toMatch(/Windows/);
    expect(validateAutoPrintHost("local", true, "DEFAULT")).toMatch(/Windows/);
    expect(validateAutoPrintHost("local", true, "  ")).toMatch(/Windows/);
  });

  it("accepts an explicit Windows queue name", () => {
    expect(validateAutoPrintHost("local", true, "XP-80C")).toBeNull();
  });

  it("does not apply to Chrome or network printers", () => {
    expect(validateAutoPrintHost("local", false, "")).toBeNull();
    expect(validateAutoPrintHost("network", true, "")).toBeNull();
  });
});

describe("resolvePrinterAutoPrint", () => {
  it("keeps the requested value for a local checkout printer", () => {
    expect(resolvePrinterAutoPrint("checkout", "local", true)).toBe(true);
    expect(resolvePrinterAutoPrint("checkout", "local", false)).toBe(false);
  });

  it("never enables auto print for network printers", () => {
    expect(resolvePrinterAutoPrint("checkout", "network", true)).toBe(false);
  });

  it("never enables auto print for kitchen-only printers", () => {
    expect(resolvePrinterAutoPrint("kitchen", "local", true)).toBe(false);
  });
});
