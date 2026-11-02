import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "@/lib/print/templates/defaults-v1";
import { buildSampleDocuments, sampleSettings } from "@/lib/print/templates/sample";
import type { ReportTemplateV2 } from "@/lib/print/templates/types";
import { ReportDesignAdmin } from "./ReportDesignAdmin";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

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

const pdf = vi.hoisted(() => ({ downloadPdf: vi.fn() }));
vi.mock("@/lib/client/download-pdf", () => ({ downloadPdf: pdf.downloadPdf }));

const document = "receipt" as const;
const receiptDefault = DEFAULT_REPORT_TEMPLATES[document];
const headerId = receiptDefault.elements.find((element) => element.type === "text")!.id;
const headerDefault =
  receiptDefault.elements.find((element) => element.id === headerId)?.type === "text"
    ? (receiptDefault.elements.find((element) => element.id === headerId) as { text: string }).text
    : "";
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
      template={receiptDefault}
      templateJson={JSON.stringify(receiptDefault, null, 2)}
      isDefault
      sample={sample}
      printers={printerList}
    />,
  );
}

function selectHeader() {
  // `document` above shadows the global DOM document, so reach it explicitly.
  fireEvent.click(globalThis.document.querySelector(`[data-element-id="${headerId}"]`)!);
}

function editHeaderText(text: string) {
  selectHeader();
  fireEvent.change(screen.getByLabelText("النص"), { target: { value: text } });
}

function savedTemplate(callIndex = 0): ReportTemplateV2 {
  const [, json] = actions.saveReportTemplate.mock.calls[callIndex]!;
  return JSON.parse(json as string) as ReportTemplateV2;
}

function savedHeaderText(): string {
  const element = savedTemplate().elements.find((entry) => entry.id === headerId);
  return element?.type === "text" ? element.text : "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReportDesignAdmin", () => {
  it("renders the grid, palette, inspector, and toolbar", () => {
    renderAdmin();
    expect(screen.getByTestId("grid-canvas")).toBeTruthy();
    expect(screen.getByText(/خصائص/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ التصميم" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "بيانات تجريبية" })).toBeTruthy();
  });

  it("edits a text element and saves the v2 template", async () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));

    expect(actions.saveReportTemplate).toHaveBeenCalledTimes(1);
    expect(actions.saveReportTemplate.mock.calls[0]![0]).toBe("receipt");
    expect(savedTemplate().version).toBe(2);
    expect(savedHeaderText()).toBe("مرحباً");
    expect(await screen.findByText("تم حفظ التصميم")).toBeTruthy();
  });

  it("undoes and redoes an edit", () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(screen.getByLabelText("النص")).toHaveValue(headerDefault);
    fireEvent.click(screen.getByRole("button", { name: "إعادة" }));
    expect(screen.getByLabelText("النص")).toHaveValue("مرحباً");
  });

  it("switches between sample and blank data", () => {
    renderAdmin();
    expect(screen.getByTestId("print-preview").textContent).toContain("كابتشينو");
    fireEvent.click(screen.getByRole("button", { name: "بيانات فارغة" }));
    expect(screen.getByTestId("print-preview").textContent).not.toContain("كابتشينو");
  });

  it("rejects invalid raw JSON without applying it", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), { target: { value: "{" } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));
    expect(screen.getByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedHeaderText()).toBe(headerDefault);
  });

  it("selects the first element after applying JSON with new ids", () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const onlyElement = {
      format: "fastpos-report",
      version: 2,
      document: "receipt",
      paper: { columns: 32 },
      elements: [
        {
          id: "el_only",
          type: "text",
          row: 0,
          col: 0,
          width: 32,
          visible: true,
          text: "سطر وحيد",
        },
      ],
      labels: {},
    };
    fireEvent.change(screen.getByLabelText("محرر JSON"), {
      target: { value: JSON.stringify(onlyElement) },
    });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));
    // The old selection is gone, so the inspector falls back to the new first
    // element instead of showing the "select an element" placeholder.
    expect(screen.getByLabelText("النص")).toHaveValue("سطر وحيد");
  });

  it("migrates pasted v1 JSON and reports it", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.change(screen.getByLabelText("محرر JSON"), {
      target: { value: JSON.stringify(DEFAULT_REPORT_TEMPLATES_V1.receipt) },
    });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق JSON" }));
    expect(screen.getByText("تم ترحيل تصميم الإصدار الأول وتطبيقه")).toBeTruthy();
    expect(
      (screen.getByLabelText("محرر JSON") as HTMLTextAreaElement).value,
    ).toContain('"version": 2');
  });

  it("imports a .fprep file into the editor", async () => {
    renderAdmin();
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    const file = new File(
      [
        JSON.stringify({
          ...receiptDefault,
          labels: { ...receiptDefault.labels, orderNo: "طلب" },
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
    const file = new File(["{", ""], "broken.fprep", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("استيراد ملف .fprep"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("ملف التصميم ليس JSON صالحاً")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حفظ التصميم" }));
    expect(savedHeaderText()).toBe(headerDefault);
  });

  it("confirms before resetting and restores the default", async () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "متقدم" }));
    fireEvent.click(screen.getByRole("button", { name: "استعادة الافتراضي" }));
    expect(screen.getByText("استعادة التصميم الافتراضي؟")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الاستعادة" }));
    expect(actions.resetReportTemplate).toHaveBeenCalledWith("receipt");
    await waitFor(() =>
      expect(screen.getByLabelText("النص")).toHaveValue(headerDefault),
    );
  });

  it("sends the current design and printer to the test print action", async () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.change(screen.getByLabelText("طابعة الاختبار"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));

    const [doc, json, printerId] = actions.testPrintReportTemplate.mock.calls[0]!;
    expect(doc).toBe("receipt");
    expect(printerId).toBe(5);
    const sent = JSON.parse(json as string) as ReportTemplateV2;
    expect(sent.version).toBe(2);
    expect(
      sent.elements.find((element) => element.id === headerId),
    ).toMatchObject({ type: "text", text: "مرحباً" });
    expect(await screen.findByText("تم الإرسال")).toBeTruthy();
  });

  it("refuses to test print without a printer", () => {
    renderAdmin([]);
    fireEvent.click(screen.getByRole("button", { name: "طباعة تجريبية" }));
    expect(screen.getByText("اختر طابعة أولاً")).toBeTruthy();
    expect(actions.testPrintReportTemplate).not.toHaveBeenCalled();
  });

  it("exports the unsaved design as a PDF preview", async () => {
    pdf.downloadPdf.mockResolvedValue({
      ok: true,
      filename: "design-receipt.pdf",
    });
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("button", { name: "تنزيل PDF" }));

    await waitFor(() => expect(pdf.downloadPdf).toHaveBeenCalledOnce());
    const request = pdf.downloadPdf.mock.calls[0]![0] as {
      document: string;
      source: string;
      template: string;
    };
    expect(request.document).toBe("receipt");
    expect(request.source).toBe("design");
    const sent = JSON.parse(request.template) as ReportTemplateV2;
    expect(
      sent.elements.find((element) => element.id === headerId),
    ).toMatchObject({ type: "text", text: "مرحباً" });
    expect(await screen.findByText("تم تنزيل design-receipt.pdf")).toBeTruthy();
  });

  it("asks before switching documents with unsaved changes", () => {
    renderAdmin();
    editHeaderText("مرحباً");
    fireEvent.click(screen.getByRole("tab", { name: "تذكرة المطبخ" }));
    expect(screen.getByRole("heading", { name: "تغييرات غير محفوظة" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تبديل" }));
    expect(router.push).toHaveBeenCalledWith("/admin/reports/design?doc=kitchen");
  });
});

describe("ReportDesignAdmin guards", () => {
  it("warns before leaving with unsaved changes", () => {
    renderAdmin();
    editHeaderText("مرحباً");
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
    editHeaderText("مرحباً");
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
