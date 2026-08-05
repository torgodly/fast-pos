"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Printer } from "lucide-react";
import { testPrinter } from "@/app/actions/admin";
import {
  ActionFeedback,
  type ActionFeedbackTone,
} from "@/components/ActionFeedback";

export function TestPrintButton({ printerId }: { printerId: number }) {
  const [pending, startTransition] = useTransition();
  const [tone, setTone] = useState<ActionFeedbackTone>("info");
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setMessage("جاري إرسال صفحة الاختبار...");
    setTone("pending");
    startTransition(async () => {
      const result = await testPrinter(printerId);
      if ("error" in result) {
        setTone("error");
        setMessage(result.error);
        return;
      }
      setTone("success");
      setMessage(result.message);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-outline btn-sm gap-1.5 rounded-xl"
        disabled={pending}
        onClick={run}
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Printer className="size-3.5" />
        )}
        اختبار طباعة
      </button>
      <ActionFeedback tone={tone} message={message} />
    </div>
  );
}
