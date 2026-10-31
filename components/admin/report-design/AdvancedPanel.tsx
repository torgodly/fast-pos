"use client";

import { useRef } from "react";

type AdvancedPanelProps = {
  jsonText: string;
  onJsonChange: (value: string) => void;
  onApply: () => void;
  onImport: (file: File | undefined) => void;
  onExport: () => void;
  onRequestReset: () => void;
};

export function AdvancedPanel({
  jsonText,
  onJsonChange,
  onApply,
  onImport,
  onExport,
  onRequestReset,
}: AdvancedPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <section className="space-y-3 rounded-2xl border border-base-300 bg-base-100 p-4">
      <h3 className="text-lg font-black">محرر JSON المتقدم</h3>
      <textarea
        aria-label="محرر JSON"
        className="textarea textarea-bordered min-h-96 w-full font-mono text-xs"
        dir="ltr"
        value={jsonText}
        onChange={(event) => onJsonChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-lg" onClick={onApply}>
          تطبيق JSON
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={() => fileInput.current?.click()}
        >
          استيراد .fprep
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".fprep,application/json"
          className="hidden"
          aria-label="استيراد ملف .fprep"
          onChange={(event) => {
            onImport(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button type="button" className="btn btn-lg" onClick={onExport}>
          تصدير .fprep
        </button>
        <button
          type="button"
          className="btn btn-lg btn-error"
          onClick={onRequestReset}
        >
          استعادة الافتراضي
        </button>
      </div>
    </section>
  );
}
