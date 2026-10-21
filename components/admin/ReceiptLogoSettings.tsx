"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { ActionFeedback } from "@/components/ActionFeedback";
import { useToast } from "@/components/ToastProvider";

const LOGO_ENDPOINT = "/api/settings/receipt-logo";

export function ReceiptLogoSettings() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [logoUrl, setLogoUrl] = useState(LOGO_ENDPOINT);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("اختر صورة أولاً");
      return;
    }

    setError(null);
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("logo", file);
      const response = await fetch(LOGO_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر رفع الشعار");

      setLogoUrl(`${LOGO_ENDPOINT}?updated=${Date.now()}`);
      if (inputRef.current) inputRef.current.value = "";
      showToast("success", "تم حفظ شعار الفاتورة");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "تعذر رفع الشعار",
      );
    } finally {
      setPending(false);
    }
  }

  async function restoreDefault() {
    setError(null);
    setPending(true);
    try {
      const response = await fetch(LOGO_ENDPOINT, { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر استعادة الشعار");

      setLogoUrl(`${LOGO_ENDPOINT}?updated=${Date.now()}`);
      if (inputRef.current) inputRef.current.value = "";
      showToast("success", "تمت استعادة الشعار الافتراضي");
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "تعذر استعادة الشعار",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex min-h-36 justify-center rounded-2xl bg-neutral p-6">
        <Image
          key={logoUrl}
          src={logoUrl}
          alt="شعار الفاتورة"
          width={1200}
          height={800}
          unoptimized
          className="h-auto max-h-36 w-auto max-w-full object-contain"
        />
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="form-control w-full">
          <span className="label-text mb-2 font-bold">اختر صورة الشعار</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="file-input file-input-bordered w-full"
            disabled={pending}
          />
          <span className="label-text-alt mt-2 text-base-content/45">
            PNG أو JPG أو WebP أو GIF — حتى 5 ميغابايت
          </span>
        </label>
        <ActionFeedback tone="error" message={error} />
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn btn-primary gap-2"
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            رفع الشعار
          </button>
          <button
            type="button"
            className="btn btn-ghost gap-2"
            disabled={pending}
            onClick={restoreDefault}
          >
            <RotateCcw className="size-4" />
            استعادة الشعار الافتراضي
          </button>
        </div>
      </form>
    </div>
  );
}
