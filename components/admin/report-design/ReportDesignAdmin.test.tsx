import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import {
  buildSampleDocuments,
  sampleSettings,
} from "@/lib/print/templates/sample";
import type { ReportTemplate } from "@/lib/print/templates/types";
import { ReportDesignAdmin } from "./ReportDesignAdmin";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const actions = vi.hoisted(() => ({
  saveReportTemplate: vi.fn(async () => ({ ok: true as const })),
  resetReportTemplate: vi.fn(async () => ({ ok: true as const })),
  testPrintReportTemplate: vi.fn(async () => ({
    ok: true as const,
    message: "تم الإرسال",
  })),
}));
vi.mock("@/app/actions/report-templates", () => ({
  saveReportTemplate: actions.saveReportTemplate,
  resetReportTemplate: actions.resetReportTemplate,
  testPrintReportTemplate: actions.testPrintReportTemplate,
}));

const document = "receipt" as const;
const receiptDefault = DEFAULT_REPORT_TEMPLATES[document];
const defaultHeaderText = receiptDefault.header.lines[0]!.text;
const sample = buildSampleDocuments(sampleSettings)[document];

const printers = [
  { id: 4, name: "كاشير", connectionType: "local" as const },
  { id: 5, name: "شبكة", connectionType: "network" as const },
];

function renderAdmin(printerList = printers) {
  render(
    <ReportDesignAdmin
      document={document}
      documents={["receipt", "kitchen", "shift", "items", "sales"]}
      template={DEFAULT_REPORT_TEMPLATES[document]}
      templateJson={JSON.stringify(DEFAULT_REPORT_TEMPLATES[document], null, 2)}
      isDefault
      sample={sample}
      printers={printerList}
    />,
  );
}

function editHeaderLine(text: string) {
  fireEvent.change(screen.getByLabelText("سطر الترويسة 1"), {
    target: { value: text },
  });
}

function savedTemplate(callIndex = 0): ReportTemplate {
  const [, json] = actions.saveReportTemplate.mock.calls[callIndex]!;
  return JSON.parse(json as string) as ReportTemplate;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportDesignAdmin", () => {
  it("renders the canvas, inspector, and toolbar", () => {
    renderAdmin();
    expect(screen.getAllByRole("group")).toHaveLength(5);
    expect(screen.getByText(/خصائص — الترويسة/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ التصميم" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "بيانات تجريبية" })).toBeTruthy();
  });

  it("edits a header line and saves the template", async () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));

    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
    expect(actions.saveReportTemplate.mock.calls[0]![0]).toBe("receipt");
    expect(savedTemplate().header.lines[0]!.text).toBe("مرحباً");
    expect(await screen.findByText("تم حفظ التصميم")).toBeTruthy();
  });

  it("undoes and redoes a canvas edit", () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(screen.getByLabelText("سطر الترويسة 1")).toHaveValue(defaultHeaderText);

    fireEvent.click(screen.getByRole("button", { name: "إعادة" }));
    expect(screen.getByLabelText("سطر الترويسة 1")).toHaveValue("مرحباً");
  });

  it("switches between sample and blank data", () => {
    renderAdmin();
    expect(screen.getByText("كابتشينو")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "بيانات فارغة" }));
    expect(screen.queryByText("كابتشينو")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "بيانات تجريبية" }));
    expect(screen.getByText("كابتشينو")).toBeTruthy();
  });

  it("rejects invalid raw JSON without applying it", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), {
      target: { value: "{" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));

    expect(screen.getByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedTemplate().header.lines[0]!.text).toBe(defaultHeaderText);
  });

  it("imports a .fprep file into the editor", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const file = new File(
      [
        JSON.stringify({
          ...DEFAULT_REPORT_TEMPLATES.receipt,
          labels: {
            ...DEFAULT_REPORT_TEMPLATES.receipt.labels,
            orderNo: "طلب",
          },
        }),
      ],
      "fastpos-receipt.fprep",
      { type: "application/json" },
    );
    fireEvent.change(screen.getByLabelText("استيراد ملف .fprep"), {
      target: { files: [file] },
    });

    await screen.findByDisplayValue(/"orderNo": "طلب"/);
    expect(screen.getByText("تم استيراد fastpos-receipt.fprep")).toBeTruthy();
    expect(actions.saveReportTemplate).not.toHaveBeenCalled();
  });

  it("refuses to import an invalid .fprep file", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const file = new File(["{", ""], "broken.fprep", {
      type: "application/json",
    });
    fireEvent.change(screen.getByLabelText("استيراد ملف .fprep"), {
      target: { files: [file] },
    });

    expect(await screen.findByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedTemplate().header.lines[0]!.text).toBe(defaultHeaderText);
  });

  it("confirms before resetting the design and restores the default state", async () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.click(screen.getByRole("button", { name: "استعادة الافتراضي" }));
    expect(screen.getByText("استعادة التصميم الافتراضي؟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الاستعادة" }));

    expect(actions.resetReportTemplate).toHaveBeenCalledWith("receipt");
    await waitFor(() =>
      expect(screen.getByLabelText("سطر الترويسة 1")).toHaveValue(
        defaultHeaderText,
      ),
    );
    expect(receiptDefault.header.lines[0]!.text).toBe(defaultHeaderText);
  });

  it("sends the current design and selected printer to the test print action", async () => {
    renderAdmin();
    editHeaderLine("مرحباً");
    fireEvent.change(screen.getByLabelText("طابعة الاختبار"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    expect(actions.testPrintReportTemplate).toHaveBeenCalledTimes(1);
    const [doc, json, printerId] = actions.testPrintReportTemplate.mock.calls[0]!;
    expect(doc).toBe("receipt");
    expect(printerId).toBe(5);
    expect(
      (JSON.parse(json as string) as ReportTemplate).header.lines[0]!.text,
    ).toBe("مرحباً");
    expect(await screen.findByText("تم الإرسال")).toBeTruthy();
  });

  it("refuses to test print without a printer", () => {
    renderAdmin([]);
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    expect(screen.getByText("اختر طابعة أولاً")).toBeTruthy();
    expect(actions.testPrintReportTemplate).not.toHaveBeenCalled();
  });

  it("asks before switching documents with unsaved changes", () => {
    renderAdmin();
    editHeaderLine("مرحباً");

    fireEvent.click(screen.getByRole("tab", { name: "تذكرة المطبخ" }));
    expect(
      screen.getByRole("heading", { name: "تغييرات غير محفوظة" }),
    ).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "تبديل" }));
    expect(router.push).toHaveBeenCalledWith(
      "/admin/reports/design?doc=kitchen",
    );
  });
});

describe("ReportDesignAdmin guards", () => {
  it("warns before leaving with unsaved changes", () => {
    renderAdmin();
    editHeaderLine("مرحباً");

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not warn when nothing changed", () => {
    renderAdmin();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not save twice while a save is in flight", async () => {
    actions.saveReportTemplate.mockClear();
    renderAdmin();
    editHeaderLine("مرحباً");

    const button = screen.getByRole("button", { name: "حفظ التصميم" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByText("تم حفظ التصميم")).toBeTruthy();
    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
  });

  it("does not test print twice while a print is in flight", async () => {
    actions.testPrintReportTemplate.mockClear();
    renderAdmin();

    const button = screen.getByRole("button", { name: "طباعة تجريبية" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByText("تم الإرسال")).toBeTruthy();
    expect(actions.testPrintReportTemplate).toHaveBeenCalledTimes(1);
  });
});
