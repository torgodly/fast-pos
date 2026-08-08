"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import {
  resetZWindowSettings,
  saveZWindowSettings,
} from "@/app/actions/admin";
import { useToast } from "@/components/ToastProvider";
import type { VenueId } from "@/lib/types";

export function ZWindowSettingsForm({
  venueId,
  venueLabel,
  initialStart,
  initialEnd,
}: {
  venueId: VenueId;
  venueLabel: string;
  initialStart: string;
  initialEnd: string;
}) {
  const { showToast } = useToast();
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveZWindowSettings(start, end, venueId);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      showToast("success", `تم حفظ وقت السماح بـ Z لـ ${venueLabel}`);
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetZWindowSettings(venueId);
      if ("error" in result) {
        showToast("error", result.error);
        return;
      }
      setStart("23:00");
      setEnd("01:00");
      showToast("success", `${venueLabel}: Z فقط من 23:00 إلى 01:00`);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-base-300/70 p-3">
      <p className="font-black">{venueLabel}</p>
      <p className="text-xs leading-5 text-base-content/55">
        يُسمح بطباعة <span className="font-black">Z</span> فقط بين هاتين
        الساعتين (وقت الإقفال). لا يوجد ضبط لبداية الدوام — المبيعات تُحسب من
        آخر Z تلقائياً.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-control">
          <span className="label-text mb-1 text-xs font-bold">
            يبدأ السماح بـ Z
          </span>
          <input
            type="time"
            className="input input-bordered input-sm"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={pending}
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-xs font-bold">
            ينتهي السماح بـ Z
          </span>
          <input
            type="time"
            className="input input-bordered input-sm"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={pending}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm gap-1.5 rounded-lg"
          disabled={pending}
          onClick={save}
        >
          {pending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          حفظ
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-1.5 rounded-lg"
          disabled={pending}
          onClick={reset}
        >
          <RotateCcw className="size-3.5" />
          23:00–01:00
        </button>
      </div>
    </div>
  );
}
