"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import {
  resetZWindowSettings,
  saveZWindowSettings,
} from "@/app/actions/admin";
import { useToast } from "@/components/ToastProvider";

export function ZWindowSettingsForm({
  initialStart,
  initialEnd,
}: {
  initialStart: string;
  initialEnd: string;
}) {
  const { showToast } = useToast();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveZWindowSettings(start, end);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", "تم حفظ نافذة تقرير Z");
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetZWindowSettings();
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      setStart("23:00");
      setEnd("01:00");
      showToast("success", "تمت إعادة النافذة الافتراضية 23:00 – 01:00");
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-base-content/60">
        تقرير Z يُطبع فقط داخل هذه النافذة (يمكن أن تمتد لليوم التالي، مثل 23:00
        إلى 01:00). تقرير X متاح في أي وقت.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-control">
          <span className="label-text mb-1 font-bold">من الساعة</span>
          <input
            type="time"
            className="input input-bordered"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 font-bold">إلى الساعة</span>
          <input
            type="time"
            className="input input-bordered"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={pending}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary gap-2 rounded-xl"
          disabled={pending}
          onClick={save}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          حفظ
        </button>
        <button
          type="button"
          className="btn btn-ghost gap-2 rounded-xl"
          disabled={pending}
          onClick={reset}
        >
          <RotateCcw className="size-4" />
          افتراضي 23:00–01:00
        </button>
      </div>
    </div>
  );
}
