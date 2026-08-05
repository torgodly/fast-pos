"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  LoaderCircle,
  Printer,
} from "lucide-react";
import { getLocalTestPrintPayload } from "@/app/actions/station";
import {
  connectLocalPrintBridge,
  printViaLocalAgent,
} from "@/lib/print/local-client";
import { useToast } from "@/components/ToastProvider";

export function LocalPrintAgentBanner({
  venueId,
  needsLocalPrint,
}: {
  venueId: string;
  needsLocalPrint: boolean;
}) {
  const { showToast } = useToast();
  const [connected, setConnected] = useState(false);
  const [pending, startTransition] = useTransition();
  const [connecting, startConnect] = useTransition();

  function connectUsb() {
    startConnect(async () => {
      const result = await connectLocalPrintBridge();
      if ("error" in result) {
        setConnected(false);
        showToast("error", result.error);
        return;
      }
      setConnected(true);
      showToast("success", "تم ربط طابعة USB — جاهزة للطباعة");
    });
  }

  function runTestPrint() {
    startTransition(async () => {
      if (!connected) {
        const link = await connectLocalPrintBridge();
        if ("error" in link) {
          showToast("error", link.error);
          return;
        }
        setConnected(true);
      }

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
        setConnected(false);
        showToast("error", result.error);
        return;
      }

      showToast("success", `تمت الطباعة على ${payload.printerName}`);
    });
  }

  if (!needsLocalPrint) return null;

  if (connected) {
    return (
      <div className="alert alert-success rounded-2xl text-sm">
        <CheckCircle2 className="size-5 shrink-0" />
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>USB متصل — الطابعة الافتراضية في Windows</span>
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
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold">اربط طابعة USB قبل الطباعة</p>
          <p className="mt-1 text-xs text-base-content/55">
            شغّل SETUP.bat على PC الكاشير أولاً. ثم اضغط الزر — اسمح بالنافذة
            المنبثقة إذا طلب Chrome ذلك.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-warning"
          disabled={connecting || pending}
          onClick={connectUsb}
        >
          {connecting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Link2 className="size-4" />
          )}
          ربط الطابعة
        </button>
      </div>
    </div>
  );
}
