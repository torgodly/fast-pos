import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { BlockInspector } from "./BlockInspector";

function renderInspector(
  selected: "header" | "fields" | "items",
  onChange = vi.fn(),
  template: ReportTemplate = DEFAULT_REPORT_TEMPLATES.receipt,
) {
  render(
    <BlockInspector
      template={structuredClone(template)}
      selected={selected}
      onChange={onChange}
    />,
  );
  return onChange;
}

function renderShiftInspector(
  selected: "header" | "fields" | "items",
  onChange = vi.fn(),
) {
  render(
    <BlockInspector
      template={structuredClone(DEFAULT_REPORT_TEMPLATES.shift)}
      selected={selected}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("BlockInspector", () => {
  it("edits a header line and its style", () => {
    const onChange = renderInspector("header");
    fireEvent.change(screen.getByLabelText("سطر الترويسة 1"), {
      target: { value: "مرحباً" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.header.lines[0]!.text).toBe("مرحباً");
  });

  it("hides the fields block without losing its selection", () => {
    const onChange = renderInspector("fields");
    fireEvent.click(screen.getByLabelText("إظهار البيانات"));
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.fields.visible).toBe(false);
    expect(next.fields.show).toEqual(
      DEFAULT_REPORT_TEMPLATES.receipt.fields.show,
    );
  });

  it("renames an item column label", () => {
    const onChange = renderInspector("items");
    fireEvent.change(
      screen.getByLabelText("عنوان العمود الصنف"),
      { target: { value: "المنتج" } },
    );
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.items.columns[0]!.label).toBe("المنتج");
  });

  it("keeps the items visibility switch for documents with item columns", () => {
    const onChange = renderInspector("items");
    const toggle = screen.getByLabelText("إظهار الأصناف");
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.items.show).toBe(false);
  });

  it("does not offer an items switch for a document without item columns", () => {
    const onChange = renderShiftInspector("items");
    expect(
      screen.getByText("هذا التقرير لا يحتوي على جدول أصناف."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("إظهار الأصناف")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "إظهار الأصناف" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits the chosen logo alignment", () => {
    const onChange = renderInspector("header");
    const select = screen.getByLabelText("محاذاة الشعار");
    expect(select).toHaveValue("center");
    fireEvent.change(select, { target: { value: "left" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.header.logo.align).toBe("left");
    expect(onChange.mock.calls[0]![1]).toEqual({
      coalesceKey: "header-logo-align",
    });
  });

  it("commits a typed logo max width on blur without rewriting the draft", () => {
    const onChange = renderInspector("header");
    const input = screen.getByLabelText("أقصى عرض للشعار");
    expect(input).toHaveValue(256);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "128" } });
    expect(input).toHaveValue(128);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.header.logo.maxWidth).toBe(128);
    expect(onChange.mock.calls[0]![1]).toEqual({
      coalesceKey: "header-logo-max-width",
    });
  });

  it("clamps an out-of-range logo max width draft on blur", () => {
    const onChange = renderInspector("header");
    const input = screen.getByLabelText("أقصى عرض للشعار");
    fireEvent.change(input, { target: { value: "999" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.header.logo.maxWidth).toBe(384);
  });

  it("falls back to 256 when the logo max width draft is cleared", () => {
    const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    template.header.logo.maxWidth = 128;
    const onChange = renderInspector("header", vi.fn(), template);
    const input = screen.getByLabelText("أقصى عرض للشعار");
    expect(input).toHaveValue(128);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as ReportTemplate;
    expect(next.header.logo.maxWidth).toBe(256);
  });

  it("falls back to centered 256px logo geometry when the template omits it", () => {
    renderShiftInspector("header");
    expect(screen.getByLabelText("محاذاة الشعار")).toHaveValue("center");
    expect(screen.getByLabelText("أقصى عرض للشعار")).toHaveValue(256);
  });
});
