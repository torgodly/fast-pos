import Image from "next/image";
import { Receipt, Settings2 } from "lucide-react";
import { ReceiptSettingsForm } from "@/components/admin/ReceiptSettingsForm";
import { requireAdmin } from "@/app/actions/auth";
import { getReceiptFooterMessage } from "@/lib/settings";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const footerMessage = getReceiptFooterMessage();

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-neutral/10 text-neutral">
            <Settings2 className="size-6" />
          </span>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">إعدادات الإيصال</h2>
            <p className="text-sm text-base-content/45">
              رسالة الفاتورة وشعار المطعم
            </p>
          </div>
        </div>
      </div>

      <section className="premium-card card">
        <div className="card-body gap-6 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="size-5" />
            </span>
            <div>
              <h3 className="font-black">شعار الفاتورة</h3>
              <p className="text-xs text-base-content/45">
                يُطبع أعلى فاتورة الكاشier وصفحة الاختبار
              </p>
            </div>
          </div>
          <div className="flex justify-center rounded-2xl bg-neutral p-6">
            <Image
              src="/receipt-logo.png"
              alt="Maison Kayser Tripoli"
              width={280}
              height={120}
              className="h-auto max-h-28 w-auto object-contain"
            />
          </div>
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <h3 className="font-black">رسالة الفاتورة</h3>
          <ReceiptSettingsForm initialMessage={footerMessage} />
        </div>
      </section>
    </div>
  );
}
