"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { resetReceiptSettings, saveReceiptSettings } from "@/app/actions/admin";
import { ActionFeedback } from "@/components/ActionFeedback";
import { useToast } from "@/components/ToastProvider";

const DEFAULT_FOOTER = "شكراً لزيارتكم — نراكم قريباً";

export function ReceiptSettingsForm({
  initialMessage,
}: {
  initialMessage: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await saveReceiptSettings(message);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      showToast("success", "تم حفظ رسالة الإيصال");
      router.refresh();
    });
  }

  function resetToDefault() {
    startTransition(async () => {
      setError(null);
      const result = await resetReceiptSettings();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setMessage(DEFAULT_FOOTER);
      showToast("success", "تمت إعادة رسالة الإيصال للافتراضي");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="form-control w-full">
        <span className="label-text mb-2 font-bold">
          رسالة أسفل فاتورة الكاشير
        </span>
        <textarea
          className="textarea textarea-bordered min-h-28 w-full leading-7"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="شكراً لزيارتكم — نراكم قريباً"
          required
        />
        <span className="label-text-alt mt-2 text-base-content/45">
          تظهر في أسفل كل فاتورة دفع مع اسم الكاشير
        </span>
      </label>
      <ActionFeedback tone="error" message={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary gap-2" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              جاري الحفظ...
            </>
          ) : (
            <>
              <Save className="size-4" />
              حفظ الإعدادات
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost gap-2"
          disabled={pending}
          onClick={resetToDefault}
        >
          <RotateCcw className="size-4" />
          إعادة للافتراضي
        </button>
      </div>
    </form>
  );
}
