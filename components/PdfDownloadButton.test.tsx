import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ToastProvider";
import { PdfDownloadButton } from "./PdfDownloadButton";

const download = vi.hoisted(() => ({ downloadPdf: vi.fn() }));
vi.mock("@/lib/client/download-pdf", () => ({ downloadPdf: download.downloadPdf }));

function renderButton(request: Parameters<typeof PdfDownloadButton>[0]["request"]) {
  render(
    <ToastProvider>
      <PdfDownloadButton request={request} />
    </ToastProvider>,
  );
}

describe("PdfDownloadButton", () => {
  it("requests the PDF for the given document", async () => {
    download.downloadPdf.mockResolvedValue({ ok: true, filename: "receipt-7.pdf" });
    renderButton({ document: "receipt", orderId: 7 });

    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));

    await waitFor(() =>
      expect(download.downloadPdf).toHaveBeenCalledWith({
        document: "receipt",
        orderId: 7,
      }),
    );
    expect(await screen.findByText("تم تنزيل receipt-7.pdf")).toBeTruthy();
  });

  it("shows the error returned by the route", async () => {
    download.downloadPdf.mockResolvedValue({ error: "غير مصرح" });
    renderButton({ document: "shift", shiftId: 3 });

    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));

    expect(await screen.findByText("غير مصرح")).toBeTruthy();
  });
});
