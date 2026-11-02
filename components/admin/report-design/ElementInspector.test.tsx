import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "@/lib/print/templates/defaults-v2";
import type { ReportTemplateV2 } from "@/lib/print/templates/types";
import { ElementInspector } from "./ElementInspector";

const defaults = DEFAULT_REPORT_TEMPLATES_V2.receipt;

function template(elements: ReportTemplateV2["elements"], labels = {}): ReportTemplateV2 {
  return { ...defaults, elements, labels };
}

describe("ElementInspector", () => {
  it("edits text and styles", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "قديم" },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_a"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("النص"), { target: { value: "جديد" } });
    expect(onCommit.mock.calls.at(-1)![0].elements[0]).toMatchObject({ text: "جديد" });
  });

  it("writes a field label into the shared labels map", () => {
    const onCommit = vi.fn();
    const value = template(
      [
        {
          id: "el_field_orderno",
          type: "field",
          row: 0,
          col: 0,
          width: 32,
          visible: true,
          fieldId: "orderNo",
        },
      ],
      { orderNo: "رقم الطلب" },
    );
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_field_orderno"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    const label = screen.getByLabelText("التسمية");
    fireEvent.change(label, { target: { value: "طلب" } });
    fireEvent.blur(label);
    expect(onCommit.mock.calls.at(-1)![0].labels.orderNo).toBe("طلب");
  });

  it("wires separator references to other elements", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "A" },
      { id: "el_sep", type: "separator", row: 1, col: 0, width: 32, visible: true },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_sep"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("إخفاء عندما يكون A فارغاً"));
    expect(onCommit.mock.calls.at(-1)![0].elements[1]).toMatchObject({
      hideWhenEmptyOf: ["el_a"],
    });
  });

  it("holds partially typed placeholder braces in a local draft", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "قديم" },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_a"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    const area = screen.getByLabelText("النص");
    fireEvent.change(area, { target: { value: "{" } });
    expect(area).toHaveValue("{");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits a complete field token typed in one go", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "قديم" },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_a"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("النص"), {
      target: { value: "السفرادجي: {{field.waiter}}" },
    });
    expect(onCommit.mock.calls.at(-1)![0].elements[0]).toMatchObject({
      text: "السفرادجي: {{field.waiter}}",
    });
  });

  it("restores the last valid text when an invalid draft loses focus", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 32, visible: true, text: "{{field.waiter}}" },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_a"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    const area = screen.getByLabelText("النص");
    fireEvent.change(area, { target: { value: "{field.waiter}}" } });
    expect(area).toHaveValue("{field.waiter}}");
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(area);
    expect(area).toHaveValue("{{field.waiter}}");
  });

  it("resets rejected numeric edits and coalesces text typing", () => {
    const onCommit = vi.fn();
    const value = template([
      { id: "el_a", type: "text", row: 0, col: 0, width: 16, visible: true, text: "A" },
      { id: "el_b", type: "text", row: 0, col: 16, width: 16, visible: true, text: "B" },
    ]);
    render(
      <ElementInspector
        template={value}
        defaults={defaults}
        selectedId="el_a"
        onCommit={onCommit}
        onSelect={vi.fn()}
      />,
    );
    const col = screen.getByLabelText("العمود");
    fireEvent.change(col, { target: { value: "20" } });
    fireEvent.blur(col);
    expect(onCommit).not.toHaveBeenCalled();
    expect((col as HTMLInputElement).value).toBe("0");

    fireEvent.change(screen.getByLabelText("النص"), { target: { value: "جديد" } });
    expect(onCommit).toHaveBeenLastCalledWith(expect.anything(), {
      coalesceKey: "text:el_a",
    });
  });
});
