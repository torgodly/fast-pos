import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "@/lib/print/templates/defaults-v2";
import type { ReportTemplateV2 } from "@/lib/print/templates/types";
import { ElementPalette } from "./ElementPalette";

const defaults = DEFAULT_REPORT_TEMPLATES_V2.receipt;

function template(elements: ReportTemplateV2["elements"]): ReportTemplateV2 {
  return { ...defaults, elements, labels: {} };
}

describe("ElementPalette", () => {
  it("disables unique entries that are already used", () => {
    render(<ElementPalette template={defaults} defaults={defaults} onCommit={vi.fn()} />);
    expect(
      (screen.getByRole("button", { name: "شعار" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "الإجمالي" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("adds text into the first free slot", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "A" },
    ]);
    render(<ElementPalette template={value} defaults={defaults} onCommit={onCommit} />);
    fireEvent.click(screen.getByRole("button", { name: "نص" }));
    const next = onCommit.mock.calls[0]![0] as ReportTemplateV2;
    expect(next.elements).toHaveLength(2);
    expect(next.elements[1]).toMatchObject({ type: "text", row: 1, col: 0 });
  });

  it("adds a field with the default Arabic label", () => {
    const onCommit = vi.fn();
    render(
      <ElementPalette template={template([])} defaults={defaults} onCommit={onCommit} />,
    );
    fireEvent.change(screen.getByLabelText("اختر حقلاً"), {
      target: { value: "orderNo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إضافة حقل" }));
    const next = onCommit.mock.calls[0]![0] as ReportTemplateV2;
    expect(next.labels.orderNo).toBe("رقم الطلب");
    expect(next.elements[0]).toMatchObject({ type: "field", fieldId: "orderNo" });
  });
});
