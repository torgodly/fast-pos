import { Clock3, KeyRound, Receipt, Settings2 } from "lucide-react";
import { ChangeAdminPasswordForm } from "@/components/admin/ChangeAdminPasswordForm";
import { ReceiptLogoSettings } from "@/components/admin/ReceiptLogoSettings";
import { ReceiptSettingsForm } from "@/components/admin/ReceiptSettingsForm";
import { SettingsDangerZone } from "@/components/admin/SettingsDangerZone";
import { ZWindowSettingsForm } from "@/components/admin/ZWindowSettingsForm";
import { requireAdmin } from "@/app/actions/auth";
import {
  getReceiptFooterMessage,
  getZWindowEnd,
  getZWindowStart,
} from "@/lib/settings";
import { DEPLOYMENT_MODE_LABELS, getDeploymentMode } from "@/lib/deployment";
import { getVenueName } from "@/lib/venues";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const mode = getDeploymentMode();
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
              كلمة المرور، الفاتورة، نافذة Z، وإعادة الضبط
            </p>
            <span className="inline-block mt-2 badge badge-outline badge-sm">
              نوع التثبيت: {DEPLOYMENT_MODE_LABELS[mode]}
            </span>
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
              <h3 className="font-black">متى يُسمح بطباعة Z؟</h3>
              <p className="text-xs text-base-content/45">
                ليس وقت دوام — فقط ساعة الإقفال. خارجها زر Z مقفول. يوم العمل =
                من آخر Z حتى الـ Z التالي تلقائياً.
              </p>
            </div>
          </div>
          {mode === "counter" ? (
            <ZWindowSettingsForm
              venueId="restaurant"
              venueLabel={getVenueName("restaurant")}
              initialStart={getZWindowStart("restaurant")}
              initialEnd={getZWindowEnd("restaurant")}
            />
          ) : (
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
          )}
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
          <ReceiptLogoSettings />
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <h3 className="font-black">رسالة الفاتورة</h3>
          <ReceiptSettingsForm initialMessage={footerMessage} />
        </div>
      </section>

      <SettingsDangerZone />
    </div>
  );
}
