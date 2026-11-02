import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "@/lib/print/templates/defaults-v2";
import { buildSampleDocuments, sampleSettings } from "@/lib/print/templates/sample";
import type { ReportTemplateV2, TemplateElement } from "@/lib/print/templates/types";
import { GridCanvas } from "./GridCanvas";

const receipt = DEFAULT_REPORT_TEMPLATES_V2.receipt;
const sample = buildSampleDocuments(sampleSettings).receipt;

function template(elements: TemplateElement[]): ReportTemplateV2 {
  return { ...receipt, elements, labels: {} };
}

function text(id: string, row: number, col: number, width: number): TemplateElement {
  return { id, type: "text", row, col, width, visible: true, text: id };
}

function renderCanvas(value: ReportTemplateV2, selectedId: string | null, handlers = {}) {
  const onCommit = vi.fn();
  const onBlocked = vi.fn();
  const onSelect = vi.fn();
  render(
    <GridCanvas
      template={value}
      data={sample}
      selectedId={selectedId}
      onSelect={onSelect}
      onCommit={onCommit}
      onBlocked={onBlocked}
      {...handlers}
    />,
  );
  return { onCommit, onBlocked, onSelect };
}

describe("GridCanvas", () => {
  it("shows the real print preview and selects a card", () => {
    const value: ReportTemplateV2 = { ...receipt, labels: {} };
    const { onSelect } = renderCanvas(value, null);
    expect(screen.getByTestId("print-preview").textContent).toContain("الصنف");
    const firstId = receipt.elements[0]!.id;
    fireEvent.click(document.querySelector(`[data-element-id="${firstId}"]`)!);
    expect(onSelect).toHaveBeenCalledWith(firstId);
  });

  it("toggles the cell grid", () => {
    renderCanvas(template([text("el_a", 0, 0, 32)]), null);
    const hide = screen.getByRole("button", { name: "إخفاء الشبكة" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(hide);
    expect(screen.getByRole("button", { name: "إظهار الشبكة" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("nudges with the keyboard and deletes while cleaning separator refs", () => {
    const value = template([
      text("el_a", 0, 0, 32),
      {
        id: "el_sep",
        type: "separator",
        row: 2,
        col: 0,
        width: 32,
        visible: true,
        hideWhenEmptyOf: ["el_a"],
      },
    ]);
    const { onCommit } = renderCanvas(value, "el_a");
    fireEvent.keyDown(screen.getByTestId("grid-canvas"), { key: "ArrowDown" });
    expect(onCommit.mock.calls.at(-1)![0].elements[0]).toMatchObject({ row: 1 });

    fireEvent.keyDown(screen.getByTestId("grid-canvas"), { key: "Delete" });
    const next = onCommit.mock.calls.at(-1)![0] as ReportTemplateV2;
    expect(next.elements.some((element) => element.id === "el_a")).toBe(false);
    const separator = next.elements.find((element) => element.id === "el_sep");
    expect(separator?.type === "separator" && separator.hideWhenEmptyOf).toBeUndefined();
  });

  it("rejects an overlapping drop with an Arabic hint", () => {
    const value = template([text("el_a", 0, 0, 16), text("el_b", 0, 16, 16)]);
    const { onBlocked } = renderCanvas(value, "el_a");
    const card = document.querySelector('[data-element-id="el_a"]') as HTMLElement;
    const grip = within(card).getByRole("button", { name: /اسحب/ });
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(grip, { pointerId: 1, clientX: 12, clientY: 0 });
    expect(onBlocked).toHaveBeenCalledWith("لا يمكن وضع العنصر هنا");
  });

  it("maps drag deltas through the measured grid width", () => {
    const value = template([text("el_a", 0, 0, 8), text("el_b", 0, 16, 16)]);
    const { onCommit } = renderCanvas(value, "el_a");
    const surface = screen.getByTestId("grid-surface");
    surface.getBoundingClientRect = () =>
      ({
        width: 720,
        height: 56,
        top: 0,
        left: 0,
        right: 720,
        bottom: 56,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const card = document.querySelector('[data-element-id="el_a"]') as HTMLElement;
    const grip = within(card).getByRole("button", { name: /اسحب/ });
    fireEvent.pointerDown(grip, { button: 0, pointerId: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(grip, { pointerId: 2, clientX: 30, clientY: 0 });
    expect(onCommit.mock.calls.at(-1)![0].elements[0]).toMatchObject({ row: 0, col: 1 });
  });
});
