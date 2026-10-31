import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { useTemplateEditor } from "./useTemplateEditor";

function withFooter(text: string): ReportTemplate {
  const template = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
  template.footer.lines = [{ text }];
  return template;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useTemplateEditor", () => {
  it("commits, undoes, and redoes edits", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );
    expect(result.current.dirty).toBe(false);

    act(() => result.current.commit(withFooter("نسخة")));
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.template.footer.lines[0]!.text).toBe("نسخة");
  });

  it("coalesces rapid edits with the same key and starts a new step after the pause", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("أ"), { coalesceKey: "line" }));
    now += 100;
    act(() => result.current.commit(withFooter("أب"), { coalesceKey: "line" }));
    now += 600;
    act(() => result.current.commit(withFooter("أبج"), { coalesceKey: "line" }));

    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("أب");
    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");
  });

  it("pushes history for replace and clears dirty on markSaved", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );
    act(() => result.current.replace(withFooter("مستورد")));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.markSaved(withFooter("مستورد")));
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(true);
  });

  it("adopts a new prop only while clean", () => {
    const { result, rerender } = renderHook(
      ({ template }) => useTemplateEditor(template),
      {
        initialProps: {
          template: structuredClone(DEFAULT_REPORT_TEMPLATES.receipt),
        },
      },
    );

    act(() => result.current.commit(withFooter("تعديل")));
    rerender({ template: withFooter("من السيرفر") });
    expect(result.current.template.footer.lines[0]!.text).toBe("تعديل");

    act(() => result.current.markSaved(withFooter("تعديل")));
    rerender({ template: withFooter("من السيرفر") });
    expect(result.current.template.footer.lines[0]!.text).toBe("من السيرفر");
  });
});

describe("useTemplateEditor history limits", () => {
  it("caps undo history at 50 steps", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    for (let index = 1; index <= 60; index += 1) {
      act(() => result.current.commit(withFooter(`خطوة ${index}`)));
    }

    for (let index = 0; index < 50; index += 1) {
      act(() => result.current.undo());
    }

    expect(result.current.template.footer.lines[0]!.text).toBe("خطوة 10");
    expect(result.current.canUndo).toBe(false);
  });

  it("never mutates the initial template or committed inputs", () => {
    const initial = structuredClone(DEFAULT_REPORT_TEMPLATES.receipt);
    const initialSnapshot = structuredClone(initial);
    const next = withFooter("أولاً");
    const { result } = renderHook(() => useTemplateEditor(initial));

    act(() => result.current.commit(next));
    next.footer.lines[0]!.text = "تغيير خارجي";

    expect(result.current.template.footer.lines[0]!.text).toBe("أولاً");
    expect(initial).toEqual(initialSnapshot);
  });

  it("pushes no history step when the commit equals the present", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() =>
      result.current.commit(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });
});

describe("useTemplateEditor review regressions", () => {
  it("keeps undo history when a save is echoed back through props", () => {
    const { result, rerender } = renderHook(
      ({ template }) => useTemplateEditor(template),
      {
        initialProps: {
          template: structuredClone(DEFAULT_REPORT_TEMPLATES.receipt),
        },
      },
    );

    act(() => result.current.commit(withFooter("تعديل")));
    const saved = structuredClone(result.current.template);

    act(() => result.current.markSaved(saved));
    expect(result.current.dirty).toBe(false);
    expect(result.current.canUndo).toBe(true);

    // Task 8: markSaved() then router.refresh() delivers the saved template.
    rerender({ template: structuredClone(saved) });

    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");
  });

  it("undoes to the pre-chain present after a no-op first coalesced commit", () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("سابق")));
    act(() => result.current.commit(withFooter("حالي")));

    // No-op keyed commit: nothing is pushed, so the chain has no boundary.
    act(() => result.current.commit(withFooter("حالي"), { coalesceKey: "line" }));
    now += 100;
    act(() => result.current.commit(withFooter("لاحق"), { coalesceKey: "line" }));

    act(() => result.current.undo());
    expect(result.current.template.footer.lines[0]!.text).toBe("حالي");
  });
});

describe("useTemplateEditor keyboard shortcuts", () => {
  it("undoes with Ctrl+Z and Cmd+Z", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("نسخة")));
    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");

    act(() => result.current.commit(withFooter("نسخة")));
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(result.current.template.footer.lines[0]!.text).toBe("{{footer}}");
  });

  it("redoes with Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("نسخة")));
    act(() => result.current.undo());

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true, shiftKey: true });
    expect(result.current.template.footer.lines[0]!.text).toBe("نسخة");

    act(() => result.current.undo());
    fireEvent.keyDown(document.body, { key: "z", metaKey: true, shiftKey: true });
    expect(result.current.template.footer.lines[0]!.text).toBe("نسخة");

    act(() => result.current.undo());
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    expect(result.current.template.footer.lines[0]!.text).toBe("نسخة");
  });

  it("ignores shortcuts inside inputs, textareas, selects and contenteditable", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("نسخة")));

    const editable = document.createElement("div");
    // jsdom does not reflect the contentEditable property onto the attribute.
    editable.setAttribute("contenteditable", "true");
    const targets: Array<[string, HTMLElement]> = [
      ["input", document.createElement("input")],
      ["textarea", document.createElement("textarea")],
      ["select", document.createElement("select")],
      ["contenteditable", editable],
    ];

    for (const [name, target] of targets) {
      document.body.appendChild(target);
      fireEvent.keyDown(target, { key: "z", ctrlKey: true });
      target.remove();
      expect(result.current.template.footer.lines[0]!.text, name).toBe("نسخة");
    }
  });

  it("ignores keys without Ctrl or Cmd", () => {
    const { result } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    act(() => result.current.commit(withFooter("نسخة")));
    fireEvent.keyDown(document.body, { key: "z" });
    expect(result.current.template.footer.lines[0]!.text).toBe("نسخة");
  });

  it("removes the keyboard listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() =>
      useTemplateEditor(structuredClone(DEFAULT_REPORT_TEMPLATES.receipt)),
    );

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
