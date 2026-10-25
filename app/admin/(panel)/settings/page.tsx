import { DatabaseBackup, KeyRound, Receipt, Settings2 } from "lucide-react";
import { BackupRestorePanel } from "@/components/admin/BackupRestorePanel";
import { ChangeAdminPasswordForm } from "@/components/admin/ChangeAdminPasswordForm";
import { ReceiptLogoSettings } from "@/components/admin/ReceiptLogoSettings";
import { ReceiptSettingsForm } from "@/components/admin/ReceiptSettingsForm";
import { SettingsDangerZone } from "@/components/admin/SettingsDangerZone";
import { requireAdmin } from "@/app/actions/auth";
import {
  getBrandDetails,
  getReceiptFooterMessage,
} from "@/lib/settings";
import { DEPLOYMENT_MODE_LABELS, getDeploymentMode } from "@/lib/deployment";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const mode = getDeploymentMode();
  const footerMessage = getReceiptFooterMessage();
  const brand = getBrandDetails();

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
              كلمة المرور، الفاتورة، النسخ الاحتياطي، وإعادة الضبط
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
          <div>
            <h3 className="font-black">بيانات العلامة ورسالة الفاتورة</h3>
            <p className="text-xs text-base-content/45">
              الاسم والهاتف والعنوان يظهرون أعلى فاتورة الكاشير، والرسالة أسفلها
            </p>
          </div>
          <ReceiptSettingsForm
            initialMessage={footerMessage}
            initialBrand={brand}
          />
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-info/10 text-info">
              <DatabaseBackup className="size-5" />
            </span>
            <div>
              <h3 className="font-black">النسخ الاحتياطي والاستعادة</h3>
              <p className="text-xs text-base-content/45">
                نزّل نسخة كاملة من بيانات النظام، أو استعد نسخة سابقة
              </p>
            </div>
          </div>
          <BackupRestorePanel />
        </div>
      </section>

      <SettingsDangerZone />
    </div>
  );
}
