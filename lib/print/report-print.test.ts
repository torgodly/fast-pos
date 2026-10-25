import { describe, expect, it } from "vitest";
import {
  resolveShiftReportPrintMode,
  shiftReportPrintError,
} from "./report-print";

const local = (overrides: Partial<{ autoPrint: boolean; host: string }> = {}) => ({
  connectionType: "local",
  autoPrint: true,
  host: "XP-80C",
  ...overrides,
});

describe("resolveShiftReportPrintMode", () => {
  it("uses raw TCP for network printers", () => {
    expect(
      resolveShiftReportPrintMode({
        connectionType: "network",
        autoPrint: false,
        host: "192.168.1.50",
      }),
    ).toBe("network");
  });

  it("uses the Windows spooler for a local auto-print printer with an explicit queue", () => {
    expect(resolveShiftReportPrintMode(local())).toBe("windows");
  });

  it("rejects a local printer that only uses the Windows default queue", () => {
    expect(resolveShiftReportPrintMode(local({ host: "default" }))).toBe(
      "unsupported",
    );
    expect(resolveShiftReportPrintMode(local({ host: "  " }))).toBe(
      "unsupported",
    );
  });

  it("rejects a local printer without auto print", () => {
    expect(resolveShiftReportPrintMode(local({ autoPrint: false }))).toBe(
      "unsupported",
    );
  });
});

describe("shiftReportPrintError", () => {
  it("has no error for supported printers", () => {
    expect(
      shiftReportPrintError({
        connectionType: "network",
        autoPrint: false,
        host: "192.168.1.50",
      }),
    ).toBeNull();
    expect(shiftReportPrintError(local())).toBeNull();
  });

  it("tells the cashier to enable auto print for a local Chrome printer", () => {
    const message = shiftReportPrintError(local({ autoPrint: false }));
    expect(message).toContain("طباعة تلقائية");
  });

  it("tells the cashier to select an explicit Windows queue", () => {
    const message = shiftReportPrintError(local({ host: "default" }));
    expect(message).toContain("طابعة Windows محددة");
  });
});
