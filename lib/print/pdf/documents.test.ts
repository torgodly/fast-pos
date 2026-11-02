// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES } from "../templates/defaults";
import { buildSampleDocuments, sampleSettings } from "../templates/sample";
import { pdfFilename, shiftPdf, samplePdf } from "./documents";

const samples = buildSampleDocuments(sampleSettings);

function header(result: { bytes: Uint8Array }) {
  return Buffer.from(result.bytes.slice(0, 8)).toString("latin1");
}

describe("pdfFilename", () => {
  it("names order documents after the per-shift number", () => {
    expect(pdfFilename({ document: "receipt", orderNo: 12, orderId: 99 })).toBe(
      "receipt-12.pdf",
    );
    expect(pdfFilename({ document: "kitchen", orderNo: 12, orderId: 99 })).toBe(
      "kitchen-12.pdf",
    );
  });

  it("falls back to the invoice id when there is no order number", () => {
    expect(
      pdfFilename({ document: "receipt", orderNo: null, orderId: 99 }),
    ).toBe("receipt-99.pdf");
  });

  it("names shift, report, and design files", () => {
    expect(pdfFilename({ document: "shift", shiftNumber: 4 })).toBe(
      "shift-4.pdf",
    );
    expect(pdfFilename({ document: "items", shiftNumber: 4 })).toBe(
      "items-4.pdf",
    );
    expect(
      pdfFilename({
        document: "sales",
        from: "2026-10-30 00:00:00",
        to: "2026-10-31 23:59:59",
      }),
    ).toBe("sales-2026-10-30_2026-10-31.pdf");
    expect(pdfFilename({ document: "receipt", design: true })).toBe(
      "design-receipt.pdf",
    );
  });
});

describe("samplePdf", () => {
  it("renders the unsaved design with sample data", async () => {
    const pdf = await samplePdf("receipt", DEFAULT_REPORT_TEMPLATES.receipt);
    expect(header(pdf)).toBe("%PDF-1.7");
    expect(pdf.filename).toBe("design-receipt.pdf");
    expect(pdf.bytes.length).toBeGreaterThan(1000);
  });

  it("renders every document", async () => {
    for (const document of [
      "receipt",
      "kitchen",
      "shift",
      "items",
      "sales",
    ] as const) {
      const pdf = await samplePdf(document, DEFAULT_REPORT_TEMPLATES[document]);
      expect(header(pdf), document).toBe("%PDF-1.7");
    }
  });
});

describe("shiftPdf", () => {
  it("renders a saved shift report", async () => {
    const shift = samples.shift;
    const pdf = await shiftPdf(
      {
        kind: "reprint",
        shiftNumber: 4,
        venueName: "فاست بوس",
        workDate: shift.fields.workDate ?? "",
        openedAt: "10:00",
        closedAt: "18:00",
        printedAt: "2026-10-31 18:05",
        printedByName: "سارة",
        openedByName: "سارة",
        closedByName: "سارة",
        invoiceCount: 2,
        totalSales: 50,
        cashTotal: 30,
        nonCashTotal: 20,
        paymentBreakdown: [{ name: "نقدي", total: 30, count: 1 }],
        totalItems: 5,
        tableSales: 30,
        quickSales: 20,
        items: [],
        openingFloat: 10,
        expenseTotal: 0,
        expenses: [],
        expectedCash: 40,
        countedCash: 40,
        difference: 0,
      },
      DEFAULT_REPORT_TEMPLATES.shift,
    );
    expect(header(pdf)).toBe("%PDF-1.7");
    expect(pdf.filename).toBe("shift-4.pdf");
  });
});
