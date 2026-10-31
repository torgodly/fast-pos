import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock("@/lib/settings", () => ({
  getSettingValue: (key: string) => state.values.get(key) ?? null,
  setSettingValue: (key: string, value: string) => {
    state.values.set(key, value);
  },
  deleteSettingValue: (key: string) => {
    state.values.delete(key);
  },
}));

import { DEFAULT_REPORT_TEMPLATES } from "./defaults";
import {
  deleteReportTemplate,
  getReportTemplateJson,
  loadReportTemplate,
  persistReportTemplate,
} from "./store";

beforeEach(() => {
  state.values.clear();
});

describe("report template store", () => {
  it("returns the default when nothing is stored", () => {
    expect(loadReportTemplate("receipt")).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt,
    );
  });

  it("round-trips a persisted template and isolates documents", () => {
    const edited = {
      ...DEFAULT_REPORT_TEMPLATES.receipt,
      labels: { ...DEFAULT_REPORT_TEMPLATES.receipt.labels, orderNo: "طلب" },
    };
    expect(persistReportTemplate("receipt", JSON.stringify(edited))).toEqual({
      ok: true,
    });
    expect(loadReportTemplate("receipt").labels.orderNo).toBe("طلب");
    expect(loadReportTemplate("kitchen")).toEqual(
      DEFAULT_REPORT_TEMPLATES.kitchen,
    );
    expect(getReportTemplateJson("receipt")).toContain('"طلب"');
  });

  it("rejects invalid JSON without touching the stored value", () => {
    persistReportTemplate(
      "receipt",
      JSON.stringify(DEFAULT_REPORT_TEMPLATES.receipt),
    );
    const result = persistReportTemplate("receipt", "{");
    expect(result.ok).toBe(false);
    expect(loadReportTemplate("receipt")).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt,
    );
  });

  it("deletes the stored row", () => {
    persistReportTemplate(
      "receipt",
      JSON.stringify(DEFAULT_REPORT_TEMPLATES.receipt),
    );
    deleteReportTemplate("receipt");
    expect(state.values.has("report_template.receipt")).toBe(false);
    expect(loadReportTemplate("receipt")).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt,
    );
  });

  it("falls back and warns once for a malformed stored template", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    state.values.set("report_template.shift", "{");
    const fresh = await import("./store");
    expect(fresh.loadReportTemplate("shift")).toEqual(
      DEFAULT_REPORT_TEMPLATES.shift,
    );
    fresh.loadReportTemplate("shift");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("[report-template] shift");
    warn.mockRestore();
  });
});
