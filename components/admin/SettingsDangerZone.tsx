"use client";

import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { FactoryResetPanel } from "@/components/FactoryResetPanel";

export function SettingsDangerZone() {
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"sales" | "full">("sales");

  function openReset(mode: "sales" | "full") {
    setResetMode(mode);
    setResetOpen(true);
  }

  return (
    <section className="premium-card card border-error/25">
      <div className="card-body gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-error/10 text-error">
            <AlertTriangle className="size-5" />
          </span>
          <div>
            <h3 className="font-black text-error">منطقة خطر — إعادة ضبط</h3>
            <p className="text-xs text-base-content/45">
              يحذف بيانات من قاعدة البيانات. يتطلب كلمة مرور المدير وتأكيدًا كتابيًا.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="btn btn-outline btn-error gap-2 rounded-xl"
            onClick={() => openReset("sales")}
          >
            <RotateCcw className="size-4" />
            حذف جميع المبيعات
          </button>
          <button
            type="button"
            className="btn btn-ghost gap-2 rounded-xl text-base-content/55"
            onClick={() => openReset("full")}
          >
            تهيئة متقدمة (طابعات، موظفون…)
          </button>
        </div>

        <FactoryResetPanel
          open={resetOpen}
          mode={resetMode}
          onClose={() => setResetOpen(false)}
        />
      </div>
    </section>
  );
}
