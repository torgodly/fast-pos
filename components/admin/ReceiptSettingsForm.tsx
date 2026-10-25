"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { resetReceiptSettings, saveReceiptSettings } from "@/app/actions/admin";
import { ActionFeedback } from "@/components/ActionFeedback";
import { useToast } from "@/components/ToastProvider";
import { BRAND_LIMITS, type BrandDetails } from "@/lib/brand";

const DEFAULT_FOOTER = "شكراً لزيارتكم — نراكم قريباً";

export function ReceiptSettingsForm({
  initialMessage,
  initialBrand,
}: {
  initialMessage: string;
  initialBrand: BrandDetails;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [message, setMessage] = useState(initialMessage);
  const [brandName, setBrandName] = useState(initialBrand.name);
  const [brandPhone, setBrandPhone] = useState(initialBrand.phone);
  const [brandAddress, setBrandAddress] = useState(initialBrand.address);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await saveReceiptSettings({
        message,
        brandName,
        brandPhone,
        brandAddress,
      });
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      showToast("success", "تم حفظ إعدادات الإيصال");
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
      setBrandName("");
      setBrandPhone("");
      setBrandAddress("");
      showToast("success", "تمت إعادة إعدادات الإيصال للافتراضي");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="form-control w-full">
          <span className="label-text mb-2 font-bold">اسم العلامة التجارية</span>
          <input
            className="input input-bordered w-full"
            value={brandName}
            onChange={(event) => setBrandName(event.target.value)}
            maxLength={BRAND_LIMITS.name}
            placeholder="مثال: مطعم الأصيل"
          />
          <span className="label-text-alt mt-2 text-base-content/45">
            يظهر أعلى الفاتورة بدل اسم الفرع. اتركه فارغاً لاستخدام اسم الفرع.
          </span>
        </label>
        <label className="form-control w-full">
          <span className="label-text mb-2 font-bold">رقم الهاتف</span>
          <input
            type="tel"
            dir="ltr"
            className="input input-bordered w-full text-left"
            value={brandPhone}
            onChange={(event) => setBrandPhone(event.target.value)}
            maxLength={BRAND_LIMITS.phone}
            placeholder="091 000 0000"
          />
          <span className="label-text-alt mt-2 text-base-content/45">
            اختياري — يظهر تحت اسم العلامة.
          </span>
        </label>
        <label className="form-control w-full md:col-span-2">
          <span className="label-text mb-2 font-bold">العنوان</span>
          <input
            className="input input-bordered w-full"
            value={brandAddress}
            onChange={(event) => setBrandAddress(event.target.value)}
            maxLength={BRAND_LIMITS.address}
            placeholder="المدينة — الشارع"
          />
          <span className="label-text-alt mt-2 text-base-content/45">
            اختياري — يظهر تحت اسم العلامة.
          </span>
        </label>
      </div>

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
              حفظ إعدادات الإيصال
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
