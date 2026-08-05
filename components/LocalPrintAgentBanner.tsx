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

  function probe() {
    checkLocalPrintAgent().then((ok) => {
      setStatus(ok ? "ok" : "missing");
    });
  }

  function retryProbe() {
    setStatus("loading");
    probe();
  }

  useEffect(() => {
    if (!needsLocalPrint) return;

    setStatus("loading");
    probe();
    const timer = window.setInterval(probe, 5000);
    return () => {
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
      <div className="flex flex-1 flex-col gap-2">
        <p className="font-bold">وكيل USB غير متصل على هذا الجهاز</p>
        <p className="text-base-content/70">
          شغّل <code className="text-xs">SETUP.bat</code> على{" "}
          <strong>PC الكاشير</strong> (حيث USB موصول)، ثم{" "}
          <code className="text-xs">CHECK.bat</code> للتأكد.
        </p>
        <p className="text-xs text-base-content/50">
          افتح شاشة الكاشير من Chrome على <strong>نفس PC</strong>، ليس iPad
          ولا السيرفر. إذا CHECK يظهر OK لكن التحذير باقٍ، اضغط إعادة التحقق.
        </p>
        <button
          type="button"
          className="btn btn-sm btn-warning w-fit"
          onClick={retryProbe}
        >
          إعادة التحقق
        </button>
      </div>
    </div>
  );
}
