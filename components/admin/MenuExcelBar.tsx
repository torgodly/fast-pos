"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";

type Summary = {
  categoriesCreated: number;
  categoriesUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  skipped: number;
  errors: string[];
};

export function MenuExcelBar() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(file: File | undefined) {
    if (!file) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/menu/import", {
        method: "POST",
        body,
      });
      const data = (await response.json()) as {
        error?: string;
        summary?: Summary;
      };
      if (!response.ok || data.error) {
        setError(data.error ?? "فشل الاستيراد");
        return;
      }
      const s = data.summary!;
      setMessage(
        `تصنيفات +${s.categoriesCreated} / تحديث ${s.categoriesUpdated} · أصناف +${s.itemsCreated} / تحديث ${s.itemsUpdated}` +
          (s.errors.length ? ` · ${s.errors.length} خطأ` : ""),
      );
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-base-300/70 bg-base-100 p-3">
      <a href="/api/admin/menu/export" className="btn btn-outline btn-sm gap-1.5 rounded-xl">
        <Download className="size-3.5" />
        تصدير Excel
      </a>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(event) => onPick(event.target.files?.[0])}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm gap-1.5 rounded-xl"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-3.5" />
        {pending ? "جاري الاستيراد…" : "استيراد Excel"}
      </button>
      <p className="text-xs text-base-content/45">
        الاستيراد يحدّث أو يضيف فقط — لا يحذف أصنافاً موجودة
      </p>
      {message ? (
        <p className="w-full text-sm font-bold text-success">{message}</p>
      ) : null}
      {error ? (
        <p className="w-full text-sm font-bold text-error">{error}</p>
      ) : null}
    </div>
  );
}
