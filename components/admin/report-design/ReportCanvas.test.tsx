import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MAX_LINES } from "@/lib/print/templates/blocks";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { tableWidths } from "@/lib/print/templates/layout";
import { buildSampleDocuments, sampleSettings } from "@/lib/print/templates/sample";
import type {
  DocumentData,
  ReportTemplate,
} from "@/lib/print/templates/types";
import { ReportCanvas } from "./ReportCanvas";

const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
const samples = buildSampleDocuments(sampleSettings);
const sample = samples.receipt;

function renderCanvas(
  next: ReportTemplate = template,
  data: DocumentData = sample,
) {
  const onCommit = vi.fn();
  render(
    <ReportCanvas
      template={next}
      data={data}
      selected="header"
      onSelect={() => {}}
      onCommit={onCommit}
    />,
  );
  return onCommit;
}

describe("ReportCanvas", () => {
  it("renders every block in printed order with real sample data", () => {
    renderCanvas();
    const groups = screen
      .getAllByRole("group")
      .map((node) => node.getAttribute("aria-label"));
    expect(groups).toEqual([
      "الترويسة",
      "البيانات",
      "الأصناف",
      "الإجمالي",
      "التذييل",
    ]);
    expect(screen.getByText("كابتشينو")).toBeTruthy();
    expect(screen.getByText("REST")).toBeTruthy();
  });

  it("moves a block with the up and down buttons", () => {
    const onCommit = renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "تحريك الإجمالي لأعلى" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![0] as ReportTemplate).order).toEqual([
      "header",
      "fields",
      "summary",
      "items",
      "footer",
    ]);
  });

  it("hides a block with the eye button", () => {
    const onCommit = renderCanvas();
    fireEvent.click(screen.getByRole("button", { name: "إخفاء البيانات" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![0] as ReportTemplate).fields.visible).toBe(
      false,
    );
  });

  it("edits a header line inline and commits on Enter", () => {
    const onCommit = renderCanvas();
    fireEvent.doubleClick(screen.getByText("REST"));
    const input = screen.getByLabelText("نص السطر 1");
    fireEvent.change(input, { target: { value: "مرحباً" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      (onCommit.mock.calls[0]![0] as ReportTemplate).header.lines[0]!.text,
    ).toBe("مرحباً");
  });

  it("cancels an inline edit on Escape", () => {
    const onCommit = renderCanvas();
    fireEvent.doubleClick(screen.getByText("REST"));
    const input = screen.getByLabelText("نص السطر 1");
    fireEvent.change(input, { target: { value: "لن يُحفظ" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("نص السطر 1")).toBeNull();
  });

  it("resizes a table column with the arrow keys", () => {
    const onCommit = renderCanvas();
    const before = tableWidths(template.items.columns, 32);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "تغيير عرض العمود الصنف" }),
      { key: "ArrowLeft" },
    );
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0]![0] as ReportTemplate;
    const after = tableWidths(next.items.columns, 32);
    expect(after[0]).toBeLessThan(before[0]!);
    expect(after.reduce((sum, value) => sum + value, 0)).toBe(32);
    expect(next.items.columns.reduce((sum, column) => sum + column.width, 0)).toBe(
      32,
    );
  });

  it("reorders blocks by dragging the handle", () => {
    const onCommit = renderCanvas();
    const cards = screen.getAllByRole("group");
    const tops = [0, 100, 200, 300, 400];
    cards.forEach((card, index) => {
      card.getBoundingClientRect = () =>
        ({
          top: tops[index],
          y: tops[index],
          bottom: tops[index]! + 100,
          height: 100,
          left: 0,
          right: 360,
          width: 360,
          x: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    });
    const handle = screen.getByRole("button", { name: "اسحب لتحريك التذييل" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 450 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 10 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 10 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![0] as ReportTemplate).order![0]).toBe(
      "footer",
    );
  });

  it("aborts a drag on pointercancel without committing", () => {
    const onCommit = renderCanvas();
    const cards = screen.getAllByRole("group");
    const tops = [0, 100, 200, 300, 400];
    cards.forEach((card, index) => {
      card.getBoundingClientRect = () =>
        ({
          top: tops[index],
          y: tops[index],
          bottom: tops[index]! + 100,
          height: 100,
          left: 0,
          right: 360,
          width: 360,
          x: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    });
    const footer = screen.getByRole("group", { name: "التذييل" });
    const handle = screen.getByRole("button", { name: "اسحب لتحريك التذييل" });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientY: 450 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 10 });
    // Drag is armed: insertion line shown and the dragged card is dimmed.
    expect(document.querySelector("[data-drop-line]")).not.toBeNull();
    expect(footer.className).toContain("opacity-60");

    fireEvent.pointerCancel(window, { pointerId: 1, clientY: 10 });

    // No commit, and the drag state is cleared.
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drop-line]")).toBeNull();
    expect(footer.className).not.toContain("opacity-60");

    // A late pointerup from the cancelled gesture must not commit either.
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 10 });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe("ReportCanvas document capability", () => {
  it("disables the items and summary eyes on the shift report", () => {
    renderCanvas(
      structuredClone(DEFAULT_REPORT_TEMPLATES.shift),
      samples.shift,
    );
    expect(screen.getByRole("button", { name: "إظهار الأصناف" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "إظهار الإجمالي" })).toBeDisabled();
    expect(
      screen.getByText("هذا التقرير لا يحتوي على جدول أصناف."),
    ).toBeVisible();
    expect(screen.getByText("هذا التقرير لا يحتوي على إجمالي.")).toBeVisible();
  });

  it("only disables the summary eye on the kitchen report", () => {
    renderCanvas(
      structuredClone(DEFAULT_REPORT_TEMPLATES.kitchen),
      samples.kitchen,
    );
    expect(screen.getByRole("button", { name: "إظهار الإجمالي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "إخفاء الأصناف" })).toBeEnabled();
  });

  it("leaves both eyes enabled on the receipt", () => {
    renderCanvas();
    expect(screen.getByRole("button", { name: "إخفاء الأصناف" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "إخفاء الإجمالي" })).toBeEnabled();
  });
});

describe("ReportCanvas column resize", () => {
  const handleName = "تغيير عرض العمود الصنف";

  it("treats an outward arrow press at the boundary as a no-op", () => {
    const onCommit = renderCanvas();
    fireEvent.keyDown(screen.getByRole("button", { name: handleName }), {
      key: "ArrowRight",
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("shrinks with ArrowLeft and restores with ArrowRight", () => {
    const commits: ReportTemplate[] = [];
    function Harness() {
      const [current, setCurrent] = useState(() =>
        structuredClone(DEFAULT_REPORT_TEMPLATES.receipt),
      );
      return (
        <ReportCanvas
          template={current}
          data={sample}
          selected="header"
          onSelect={() => {}}
          onCommit={(next) => {
            commits.push(next);
            setCurrent(next);
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("button", { name: handleName }), {
      key: "ArrowLeft",
    });
    expect(commits).toHaveLength(1);
    const shrunk = tableWidths(commits[0]!.items.columns, 32);
    expect(shrunk).not.toEqual(tableWidths(template.items.columns, 32));

    fireEvent.keyDown(screen.getByRole("button", { name: handleName }), {
      key: "ArrowRight",
    });
    expect(commits).toHaveLength(2);
    expect(tableWidths(commits[1]!.items.columns, 32)).toEqual(
      tableWidths(template.items.columns, 32),
    );
  });

  it("resizes on pointer drag and stops committing after pointercancel", () => {
    const onCommit = renderCanvas();
    const handle = screen.getByRole("button", { name: handleName });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 200 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 188 });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0]![0] as ReportTemplate;
    expect(tableWidths(next.items.columns, 32)).not.toEqual(
      tableWidths(template.items.columns, 32),
    );

    fireEvent.pointerCancel(handle, { pointerId: 7 });
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 120 });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe("ReportCanvas spec hints", () => {
  it("shows an Arabic hint when the header is at the six-line cap", () => {
    const capped = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    capped.header.lines = Array.from({ length: MAX_LINES }, (_, index) => ({
      text: `سطر ${index + 1}`,
    }));
    renderCanvas(capped);
    expect(
      screen.getByRole("button", { name: "إضافة سطر إلى الترويسة" }),
    ).toBeDisabled();
    expect(screen.getByText("الحد الأقصى 6 أسطر")).toBeVisible();
  });

  it("shows an empty-paper hint when every block is hidden", () => {
    const hidden = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    hidden.header.show = false;
    hidden.fields.visible = false;
    hidden.items.show = false;
    hidden.summary.show = false;
    hidden.footer.show = false;
    renderCanvas(hidden);
    expect(
      screen.getByText("كل المكوّنات مخفية — لن يظهر شيء في الطباعة."),
    ).toBeVisible();
  });
});
