import { describe, expect, it } from "vitest";
import { parseSystemPrintersJson } from "@/lib/print/system-printers";

describe("system printer parsing", () => {
  it("reads names, ports and the default flag from PowerShell JSON", () => {
    const printers = parseSystemPrintersJson(
      JSON.stringify([
        {
          name: "EPSON L3250 Series",
          driver: "EPSON L3250 Series",
          portName: "USB003",
          isDefault: false,
          host: null,
          port: null,
        },
        {
          name: "كاشير رئيسي",
          driver: "Generic / Text Only",
          portName: "192.168.1.50",
          isDefault: true,
          host: "192.168.1.50",
          port: 9100,
        },
      ]),
    );

    expect(printers.map((printer) => printer.name)).toEqual([
      "كاشير رئيسي",
      "EPSON L3250 Series",
    ]);
    expect(printers[0]).toMatchObject({
      isDefault: true,
      host: "192.168.1.50",
      port: 9100,
    });
  });

  it("accepts a single printer object and ignores unusable rows", () => {
    const printers = parseSystemPrintersJson(
      JSON.stringify([
        {
          name: " HP LaserJet ",
          driver: "HP",
          portName: "USB001",
          isDefault: "False",
          host: "",
          port: 0,
        },
        { driver: "missing name" },
        null,
      ]),
    );

    expect(printers).toEqual([
      {
        name: "HP LaserJet",
        driver: "HP",
        portName: "USB001",
        isDefault: false,
        host: null,
        port: null,
      },
    ]);

    expect(
      parseSystemPrintersJson(
        JSON.stringify({
          name: "Only Printer",
          driver: "Driver",
          portName: "PORTPROMPT:",
          isDefault: false,
          host: null,
          port: null,
        }),
      ),
    ).toHaveLength(1);
  });

  it("handles an empty response", () => {
    expect(parseSystemPrintersJson("")).toEqual([]);
    expect(parseSystemPrintersJson("[]")).toEqual([]);
  });
});
