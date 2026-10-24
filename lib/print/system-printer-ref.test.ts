import { describe, expect, it } from "vitest";
import {
  encodeSystemPrinterRef,
  parseSystemPrinterRef,
} from "./system-printer-ref";

const networkPrinter = {
  name: "طابعة المطبخ",
  driver: "EPSON",
  portName: "192.168.1.40",
  isDefault: false,
  host: "192.168.1.40",
  port: 9100,
};

describe("system printer category refs", () => {
  it("round-trips a network printer with an Arabic name", () => {
    const value = encodeSystemPrinterRef(networkPrinter);

    expect(value).toMatch(/^sys:/);
    expect(parseSystemPrinterRef(value!)).toEqual({
      name: "طابعة المطبخ",
      host: "192.168.1.40",
      port: 9100,
    });
  });

  it("defaults a missing port to 9100", () => {
    const value = encodeSystemPrinterRef({
      ...networkPrinter,
      port: null,
    });

    expect(parseSystemPrinterRef(value!)?.port).toBe(9100);
  });

  it("returns null for local printers without a host", () => {
    expect(
      encodeSystemPrinterRef({ ...networkPrinter, host: null, port: null }),
    ).toBeNull();
  });

  it("rejects malformed values and invalid ports", () => {
    expect(parseSystemPrinterRef("12")).toBeNull();
    expect(parseSystemPrinterRef("sys:not-json")).toBeNull();
    expect(
      parseSystemPrinterRef(
        `sys:${encodeURIComponent(
          JSON.stringify({ name: "Printer", host: "", port: 9100 }),
        )}`,
      ),
    ).toBeNull();
    expect(
      parseSystemPrinterRef(
        `sys:${encodeURIComponent(
          JSON.stringify({ name: "Printer", host: "10.0.0.5", port: 70000 }),
        )}`,
      ),
    ).toBeNull();
    expect(
      parseSystemPrinterRef(
        `sys:${encodeURIComponent(
          JSON.stringify({ name: "Printer", host: "bad host", port: 9100 }),
        )}`,
      ),
    ).toBeNull();
  });
});
