// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canDownloadOrderPdf: vi.fn(),
  canDownloadShiftPdf: vi.fn(),
  canDownloadSalesPdf: vi.fn(),
  canDownloadDesignPdf: vi.fn(),
  receiptPdfForOrder: vi.fn(),
  kitchenPdfForOrder: vi.fn(),
  shiftPdf: vi.fn(),
  itemsPdf: vi.fn(),
  salesPdf: vi.fn(),
  samplePdf: vi.fn(),
  getShiftById: vi.fn(),
  buildShiftReportData: vi.fn(),
  getReportSummary: vi.fn(),
  summaryToPrintData: vi.fn(),
  parseReportTemplateJson: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/print/pdf/access", () => ({
  canDownloadOrderPdf: mocks.canDownloadOrderPdf,
  canDownloadShiftPdf: mocks.canDownloadShiftPdf,
  canDownloadSalesPdf: mocks.canDownloadSalesPdf,
  canDownloadDesignPdf: mocks.canDownloadDesignPdf,
}));
vi.mock("@/lib/print/pdf/documents", () => ({
  receiptPdfForOrder: mocks.receiptPdfForOrder,
  kitchenPdfForOrder: mocks.kitchenPdfForOrder,
  shiftPdf: mocks.shiftPdf,
  itemsPdf: mocks.itemsPdf,
  salesPdf: mocks.salesPdf,
  samplePdf: mocks.samplePdf,
}));
vi.mock("@/lib/shifts/core", () => ({
  getShiftById: mocks.getShiftById,
  buildShiftReportData: mocks.buildShiftReportData,
}));
vi.mock("@/lib/reports/summary", () => ({
  getReportSummary: mocks.getReportSummary,
}));
vi.mock("@/lib/reports/print-data", () => ({
  summaryToPrintData: mocks.summaryToPrintData,
}));
vi.mock("@/lib/print/templates/schema", () => ({
  parseReportTemplateJson: mocks.parseReportTemplateJson,
}));

import { POST } from "./route";

const {
  getSession,
  canDownloadOrderPdf,
  canDownloadShiftPdf,
  canDownloadSalesPdf,
  canDownloadDesignPdf,
  receiptPdfForOrder,
  kitchenPdfForOrder,
  shiftPdf,
  itemsPdf,
  salesPdf,
  samplePdf,
  getShiftById,
  buildShiftReportData,
  getReportSummary,
  summaryToPrintData,
  parseReportTemplateJson,
} = mocks;

const admin = { userId: 1, role: "admin", name: "المدير" };
const cashier = { userId: 2, role: "cashier", name: "سارة" };
const pdf = (filename = "receipt-12.pdf") => ({
  bytes: new Uint8Array([37, 80, 68, 70]),
  filename,
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/reports/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue(admin);
  canDownloadOrderPdf.mockReturnValue(true);
  canDownloadShiftPdf.mockReturnValue(true);
  canDownloadSalesPdf.mockReturnValue(true);
  canDownloadDesignPdf.mockReturnValue(true);
  receiptPdfForOrder.mockResolvedValue(pdf());
  kitchenPdfForOrder.mockResolvedValue(pdf("kitchen-12.pdf"));
  getShiftById.mockReturnValue({ id: 4, status: "closed", venueId: "restaurant" });
  buildShiftReportData.mockReturnValue({ shiftNumber: 4, items: [] });
  shiftPdf.mockResolvedValue(pdf("shift-4.pdf"));
  itemsPdf.mockResolvedValue(pdf("items-4.pdf"));
  getReportSummary.mockReturnValue({
    venue: "restaurant",
    venueName: "المطعم",
    fromSql: "2026-10-30 00:00:00",
    toSql: "2026-10-31 23:59:59",
    rows: [],
  });
  summaryToPrintData.mockReturnValue({ fromLabel: "", toLabel: "" });
  salesPdf.mockResolvedValue(pdf("sales-2026-10-30_2026-10-31.pdf"));
  parseReportTemplateJson.mockReturnValue({ ok: true, template: {} });
  samplePdf.mockResolvedValue(pdf("design-receipt.pdf"));
});

describe("POST /api/reports/pdf", () => {
  it("rejects anonymous requests", async () => {
    getSession.mockResolvedValue(null);
    const response = await post({ document: "receipt", orderId: 12 });
    expect(response.status).toBe(401);
  });

  it("rejects unknown documents", async () => {
    const response = await post({ document: "payroll" });
    expect(response.status).toBe(400);
  });

  it("refuses an invoice belonging to another cashier", async () => {
    canDownloadOrderPdf.mockReturnValue(false);
    const response = await post({ document: "receipt", orderId: 12 });
    expect(response.status).toBe(403);
    expect(receiptPdfForOrder).not.toHaveBeenCalled();
  });

  it("returns the receipt PDF as a download", async () => {
    const response = await post({ document: "receipt", orderId: 12 });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="receipt-12.pdf"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
    expect(canDownloadOrderPdf).toHaveBeenCalledWith(admin, 12);
  });

  it("prints the kitchen copy through the kitchen builder", async () => {
    const response = await post({ document: "kitchen", orderId: 12 });
    expect(response.status).toBe(200);
    expect(kitchenPdfForOrder).toHaveBeenCalledWith(12);
  });

  it("returns the shift report and items ticket", async () => {
    const shift = await post({ document: "shift", shiftId: 4 });
    expect(shift.status).toBe(200);
    expect(buildShiftReportData).toHaveBeenCalledWith(4, admin.name, "reprint");
    expect(shiftPdf).toHaveBeenCalled();

    const items = await post({ document: "items", shiftId: 4 });
    expect(items.status).toBe(200);
    expect(itemsPdf).toHaveBeenCalled();
  });

  it("exports an open shift as a running summary", async () => {
    getShiftById.mockReturnValue({ id: 5, status: "open", venueId: "restaurant" });
    const response = await post({ document: "shift", shiftId: 5 });
    expect(response.status).toBe(200);
    expect(buildShiftReportData).toHaveBeenCalledWith(5, admin.name, "summary");
    expect(shiftPdf).toHaveBeenCalled();
  });

  it("returns 404 for a missing shift", async () => {
    getShiftById.mockReturnValue(undefined);
    const response = await post({ document: "items", shiftId: 99 });
    expect(response.status).toBe(404);
    expect(itemsPdf).not.toHaveBeenCalled();
  });

  it("limits reports to admins", async () => {
    getSession.mockResolvedValue(cashier);
    canDownloadSalesPdf.mockReturnValue(false);
    const response = await post({ document: "sales" });
    expect(response.status).toBe(403);
  });

  it("renders the sales report for the given filters", async () => {
    const filters = { venue: "restaurant", from: "2026-10-30", to: "2026-10-31" };
    const response = await post({ document: "sales", filters });
    expect(response.status).toBe(200);
    expect(getReportSummary).toHaveBeenCalledWith(filters);
    expect(salesPdf).toHaveBeenCalledWith(
      { fromLabel: "", toLabel: "" },
      undefined,
      { from: "2026-10-30 00:00:00", to: "2026-10-31 23:59:59" },
    );
  });

  it("downloads an unsaved design with sample data", async () => {
    const response = await post({
      document: "receipt",
      source: "design",
      template: "{}",
    });
    expect(response.status).toBe(200);
    expect(parseReportTemplateJson).toHaveBeenCalledWith("{}", "receipt");
    expect(samplePdf).toHaveBeenCalled();
  });

  it("rejects an invalid design", async () => {
    parseReportTemplateJson.mockReturnValue({
      ok: false,
      errors: ["التصميم غير صالح"],
    });
    const response = await post({
      document: "receipt",
      source: "design",
      template: "{",
    });
    expect(response.status).toBe(400);
    expect(samplePdf).not.toHaveBeenCalled();
  });
});
