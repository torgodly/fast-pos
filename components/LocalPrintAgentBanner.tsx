"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { checkLocalPrintAgent } from "@/lib/print/local-client";

export function LocalPrintAgentBanner({
  needsLocalPrint,
}: {
  needsLocalPrint: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "missing">(
    "loading",
  );

  useEffect(() => {
    if (!needsLocalPrint) return;
    let active = true;
    checkLocalPrintAgent().then((ok) => {
      if (active) setStatus(ok ? "ok" : "missing");
    });
    return () => {
      active = false;
    };
  }, [needsLocalPrint]);

  if (!needsLocalPrint) return null;

  if (status === "loading") {
    return (
      <div className="alert alert-info rounded-2xl text-sm">
        <LoaderCircle className="size-5 animate-spin" />
        <span>جاري التحقق من وكيل الطباعة المحلي...</span>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div className="alert alert-success rounded-2xl text-sm">
        <CheckCircle2 className="size-5" />
        <span>وكيل الطباعة المحلي يعمل — الطباعة مباشرة بدون نافذة</span>
      </div>
    );
  }

  return (
    <div className="alert alert-error rounded-2xl text-sm">
      <AlertTriangle className="size-5" />
      <span>
        شغّل <strong>Fast POS Print Agent</strong> على هذا الجهاز (start.bat في
        tools/cashier-print-agent) — وإلا لن تطبع فاتورة USB
      </span>
    </div>
  );
}
