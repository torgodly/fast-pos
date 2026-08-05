"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Printer,
} from "lucide-react";
import { getLocalTestPrintPayload } from "@/app/actions/station";
import { checkLocalPrintAgent, printViaLocalAgent } from "@/lib/print/local-client";
import { useToast } from "@/components/ToastProvider";

export function LocalPrintAgentBanner({
  venueId,
  needsLocalPrint,
}: {
  venueId: string;
  needsLocalPrint: boolean;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<"loading" | "ok" | "missing">(
    "loading",
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!needsLocalPrint) return;
    let active = true;

    function probe() {
      checkLocalPrintAgent().then((ok) => {
        if (active) setStatus(ok ? "ok" : "missing");
      });
    }

    probe();
    const timer = window.setInterval(probe, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [needsLocalPrint]);

  function runTestPrint() {
    startTransition(async () => {
      const payload = await getLocalTestPrintPayload(venueId);
      if ("error" in payload) {
        showToast("error", payload.error);
        return;
      }

      const result = await printViaLocalAgent({
        data: payload.printData,
        printerName:
          payload.localPrinterName === "default"
            ? undefined
            : payload.localPrinterName,
      });

      if ("error" in result) {
        showToast("error", result.error);
        return;
      }

      showToast("success", `تمت الطباعة على ${payload.printerName}`);
    });
  }

  if (!needsLocalPrint) return null;

  if (status === "loading") {
    return (
      <div className="alert alert-info rounded-2xl text-sm">
        <LoaderCircle className="size-5 animate-spin" />
        <span>جاري التحقق من الطباعة المحلية...</span>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className="alert alert-success rounded-2xl text-sm">
        <CheckCircle2 className="size-5 shrink-0" />
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>USB جاهز — الطابعة الافتراضية في Windows</span>
          <button
            type="button"
            className="btn btn-sm border-success/30 bg-success/10"
            disabled={pending}
            onClick={runTestPrint}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            اختبار طباعة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="alert alert-warning rounded-2xl text-sm">
      <AlertTriangle className="size-5 shrink-0" />
      <div>
        <p className="font-bold">شغّل SETUP.bat على PC الكاشير — ليس على السيرفر!</p>
        <p className="mt-1 text-base-content/70">
          انسخ مجلد <code className="text-xs">tools\cashier-print-agent</code> إلى
          جهاز الكاشير (حيث USB موصول)، ثم شغّل SETUP.bat هناك.
        </p>
        <p className="mt-1 text-xs text-base-content/50">
          افتح شاشة الكاشير من متصفح ذلك الجهاز، ليس من iPad.
        </p>
      </div>
    </div>
  );
}
