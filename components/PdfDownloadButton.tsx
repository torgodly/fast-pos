"use client";

import { useTransition } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { downloadPdf, type PdfRequest } from "@/lib/client/download-pdf";

export function PdfDownloadButton({
  request,
  label = "PDF",
  title = "تنزيل نسخة PDF",
  className = "btn btn-outline btn-sm gap-1.5 rounded-xl",
}: {
  request: PdfRequest;
  label?: string;
  title?: string;
  className?: string;
}) {
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await downloadPdf(request);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", `تم تنزيل ${result.filename}`);
    });
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={pending}
      onClick={run}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <FileDown className="size-3.5" />
      )}
      {label}
    </button>
  );
}
