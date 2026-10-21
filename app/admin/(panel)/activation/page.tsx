import { KeyRound, ShieldCheck, ShieldX } from "lucide-react";
import {
  activateLicense,
  deactivateLicense,
} from "@/app/actions/activation";
import { getActivationStatus } from "@/lib/activation/service";
import { requireAdmin } from "@/app/actions/auth";

const errorMessages: Record<string, string> = {
  malformed: "صيغة رمز التفعيل غير صحيحة.",
  invalid_signature: "توقيع الترخيص غير صالح.",
  wrong_product: "هذا الترخيص ليس لهذا المنتج.",
  wrong_installation: "هذا الترخيص صادر لتثبيت آخر.",
  not_yet_valid: "لم يبدأ سريان هذا الترخيص بعد.",
  expired: "انتهت صلاحية هذا الترخيص.",
  public_key_missing: "لم يتم إعداد مفتاح التحقق العام على السيرفر.",
  public_key_invalid: "مفتاح التحقق العام على السيرفر غير صالح.",
};
const verificationMessages: Record<string, string> = {
  malformed: "صيغة الترخيص غير صحيحة.",
  invalid_signature: "توقيع الترخيص غير صالح.",
  wrong_product: "الترخيص غير مخصص لهذا المنتج.",
  wrong_installation: "الترخيص صادر لتثبيت آخر.",
  not_yet_valid: "لم يبدأ سريان الترخيص بعد.",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("ar-LY", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ActivationPage({
  searchParams,
}: {
  searchParams: Promise<{
    activated?: string;
    deactivated?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const [status, params] = await Promise.all([
    Promise.resolve(getActivationStatus()),
    searchParams,
  ]);
  const statusLabel =
    status.state === "licensed"
      ? "مرخّص"
      : status.state === "trial"
        ? "فترة تجريبية"
        : status.state === "expired"
          ? "انتهت صلاحية الترخيص"
          : status.state === "invalid"
            ? "ترخيص غير صالح"
            : "يلزم التفعيل";
  const statusTone = status.canOperate ? "success" : "error";

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">تفعيل النظام</h2>
          <p className="text-sm text-base-content/45">
            التراخيص تعمل دون اتصال بالإنترنت وترتبط بهذا التثبيت
          </p>
        </div>
      </div>

      {params.activated ? (
        <div className="alert alert-success alert-soft">
          <ShieldCheck className="size-5" />
          <span>تم تفعيل الترخيص بنجاح.</span>
        </div>
      ) : null}
      {params.deactivated ? (
        <div className="alert alert-info alert-soft">
          <span>تم إلغاء التفعيل محلياً. لا يؤثر ذلك على أي تثبيت آخر.</span>
        </div>
      ) : null}
      {params.error ? (
        <div className="alert alert-error alert-soft">
          <ShieldX className="size-5" />
          <span>{errorMessages[params.error] ?? "تعذر تفعيل الترخيص."}</span>
        </div>
      ) : null}

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className={`alert alert-${statusTone} alert-soft`}>
            {status.canOperate ? (
              <ShieldCheck className="size-5" />
            ) : (
              <ShieldX className="size-5" />
            )}
            <div>
              <p className="font-black">{statusLabel}</p>
              {status.state === "trial" ? (
                <p className="text-sm">
                  تنتهي الفترة التجريبية في {formatDate(status.trialEndsAt)} (
                  {status.trialDaysRemaining} يوم متبقٍ).
                </p>
              ) : null}
              {status.license ? (
                <p className="text-sm">
                  رقم الترخيص: {status.license.licenseId} — صالح حتى{" "}
                  {status.license.expiresOn} (UTC)
                </p>
              ) : null}
              {!status.canOperate && status.message ? (
                <p className="text-sm">
                  {verificationMessages[status.message] ?? status.message}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">معرّف هذا التثبيت</p>
            <code
              dir="ltr"
              className="block break-all rounded-xl bg-base-200 p-3 text-sm"
            >
              {status.installationId}
            </code>
            <p className="mt-2 text-xs text-base-content/50">
              أرسل هذا المعرّف إلى الجهة التي تصدر الترخيص.
            </p>
          </div>

          {status.verificationKeyMessage ? (
            <div className="alert alert-warning alert-soft text-sm">
              {status.verificationKeyMessage}. أضف
              {" "}
              <code dir="ltr">ACTIVATION_PUBLIC_KEY_FILE</code>
              {" "}
              إلى ملف البيئة ثم أعد تشغيل السيرفر قبل إدخال الترخيص.
            </div>
          ) : null}
        </div>
      </section>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div>
            <h3 className="font-black">إدخال رمز التفعيل</h3>
            <p className="mt-1 text-sm text-base-content/50">
              الصق الرمز الموقع لهذا التثبيت.
            </p>
          </div>
          <form action={activateLicense} className="flex flex-col gap-3">
            <textarea
              name="license"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              maxLength={8192}
              required
              className="textarea textarea-bordered min-h-32 w-full font-mono text-xs"
              placeholder="eyJ2ZXJzaW9uIjoxLC4uLn0.signature"
            />
            <button type="submit" className="btn btn-primary self-start">
              تفعيل الترخيص
            </button>
          </form>
        </div>
      </section>

      {status.hasStoredLicense ? (
        <section className="premium-card card">
          <div className="card-body gap-3 p-5 sm:p-6">
            <h3 className="font-black">إلغاء التفعيل على هذا الجهاز</h3>
            <p className="text-sm text-base-content/55">
              الإلغاء محلي فقط؛ لن يتم إبطال الرمز على أجهزة أخرى غير متصلة.
            </p>
            <form action={deactivateLicense}>
              <button type="submit" className="btn btn-outline btn-error">
                إلغاء التفعيل محلياً
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
