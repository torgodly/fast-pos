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
