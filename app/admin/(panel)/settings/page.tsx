import Image from "next/image";
import { Clock3, KeyRound, Receipt, Settings2 } from "lucide-react";
import { ChangeAdminPasswordForm } from "@/components/admin/ChangeAdminPasswordForm";
import { ReceiptSettingsForm } from "@/components/admin/ReceiptSettingsForm";
import { ZWindowSettingsForm } from "@/components/admin/ZWindowSettingsForm";
import { requireAdmin } from "@/app/actions/auth";
import {
  getReceiptFooterMessage,
  getZWindowEnd,
  getZWindowStart,
} from "@/lib/settings";
import { getVenueName } from "@/lib/venues";

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
            <h2 className="text-2xl font-black sm:text-3xl">الإعدادات</h2>
            <p className="text-sm text-base-content/45">
              كلمة المرور، الفاتورة، ونافذة Z لكل فرع
            </p>
          </div>
        </div>
      </div>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-error/10 text-error">
              <Clock3 className="size-5" />
            </span>
            <div>
              <h3 className="font-black">نافذة تقرير Z لكل فرع</h3>
              <p className="text-xs text-base-content/45">
                المطعم والكافيه مستقلان — كل فرع له يوم عمل وX/Z خاص به
              </p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <ZWindowSettingsForm
              venueId="restaurant"
              venueLabel={getVenueName("restaurant")}
              initialStart={getZWindowStart("restaurant")}
              initialEnd={getZWindowEnd("restaurant")}
            />
            <ZWindowSettingsForm
              venueId="cafe"
              venueLabel={getVenueName("cafe")}
              initialStart={getZWindowStart("cafe")}
              initialEnd={getZWindowEnd("cafe")}
            />
          </div>
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-warning/10 text-warning">
              <KeyRound className="size-5" />
            </span>
            <div>
              <h3 className="font-black">تغيير كلمة مرور المدير</h3>
              <p className="text-xs text-base-content/45">
                أدخل كلمة المرور الحالية ثم الجديدة
              </p>
            </div>
          </div>
          <ChangeAdminPasswordForm />
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-6 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="size-5" />
            </span>
            <div>
              <h3 className="font-black">شعار الفاتورة</h3>
              <p className="text-xs text-base-content/45">
                يُطبع أعلى فاتورة الكاشير وصفحة الاختبار
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
