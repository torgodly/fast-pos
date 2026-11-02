// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadPdf } from "./download-pdf";

const fetchMock = vi.fn();

function pdfResponse(filename: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/pdf" };
  if (filename) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }
  return new Response(new Blob(["%PDF-1.7"]), { status: 200, headers });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("downloadPdf", () => {
  it("posts the request and saves the attachment under its server filename", async () => {
    fetchMock.mockResolvedValue(pdfResponse("receipt-7.pdf"));

    const result = await downloadPdf({ document: "receipt", orderId: 7 });

    expect(result).toEqual({ ok: true, filename: "receipt-7.pdf" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reports/pdf",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ document: "receipt", orderId: 7 }),
      }),
    );
    const anchor = HTMLAnchorElement.prototype.click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("receipt-7.pdf");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("falls back to document.pdf when the server sends no filename", async () => {
    fetchMock.mockResolvedValue(pdfResponse(null));

    await expect(downloadPdf({ document: "sales" })).resolves.toEqual({
      ok: true,
      filename: "document.pdf",
    });
  });

  it("returns the server error message and downloads nothing on failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(downloadPdf({ document: "shift", shiftId: 2 })).resolves.toEqual({
      error: "غير مصرح",
    });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("reports a connection error when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(downloadPdf({ document: "items", shiftId: 2 })).resolves.toEqual({
      error: "تعذر الاتصال بالخادم",
    });
  });
});
