import { describe, expect, it } from "vitest";
import { DISPLAY_PRINTER_GROUPS } from "@/lib/reports/groups";

describe("display printer groups", () => {
  it("routes hot/cold drinks to display printers", () => {
    expect(DISPLAY_PRINTER_GROUPS.has("مشروبات ساخنة")).toBe(true);
    expect(DISPLAY_PRINTER_GROUPS.has("مشروبات باردة")).toBe(true);
    expect(DISPLAY_PRINTER_GROUPS.has("شوربة")).toBe(false);
  });
});
