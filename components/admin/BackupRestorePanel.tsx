"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  DatabaseBackup,
  Download,
  HardDriveDownload,
  LoaderCircle,
} from "lucide-react";
import { ActionFeedback } from "@/components/ActionFeedback";
import { useToast } from "@/components/ToastProvider";

const RESTORE_ENDPOINT = "/api/admin/backup/restore";

type RestoreResult = {
  ok: boolean;
  counts: { venues: number; users: number; items: number; orders: number };
  replacedOpenShifts: number;
  safetyBackup: string;
  logo: "restored" | "removed" | "kept";
  warning?: string;
};

function resultMessage(result: RestoreResult): string {
  const { counts } = result;
  const parts = [
    `تمت استعادة البيانات: ${counts.venues} فرع، ${counts.users} مستخدم، ${counts.items} صنف، ${counts.orders} طلب.`,
    `نسخة الأمان قبل الاستعادة: ${result.safetyBackup}`,
  ];
  if (result.replacedOpenShifts > 0) {
    parts.push("تنبيه: كانت هناك وردية مفتوحة أثناء الاستعادة وتم استبدالها.");
  }
  if (result.warning) parts.push(result.warning);
  return parts.join(" ");
}

export function BackupRestorePanel() {
  const router = useRouter();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("اختر ملف النسخة الاحتياطية أولاً");
      return;
    }
    if (!password.trim()) {
      setError("أدخل كلمة مرور المدير");
      return;
    }

    setError(null);
    setResult(null);
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("password", password);
      const response = await fetch(RESTORE_ENDPOINT, {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => ({}))) as Partial<
        RestoreResult & { error: string }
      >;
      if (!response.ok || !body.ok) {
        throw new Error(
          body.error ||
            (response.status === 403
              ? "كلمة المرور غير صحيحة"
              : "تعذرت استعادة النسخة الاحتياطية"),
        );
      }

      setResult(body as RestoreResult);
      setFile(null);
      setPassword("");
      if (fileRef.current) fileRef.current.value = "";
      showToast("success", "تمت استعادة النسخة الاحتياطية بنجاح");
      router.refresh();
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "تعذرت استعادة النسخة الاحتياطية",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-base-300 bg-base-200/40 p-4 sm:p-5">
        <div className="flex items-center gap-2 font-black">
          <DatabaseBackup className="size-4 text-primary" />
          تنزيل نسخة احتياطية
        </div>
        <p className="text-xs leading-6 text-base-content/55">
          تشمل النسخة قاعدة البيانات كاملة (المبيعات، القائمة، الموظفون،
          الطابعات، الورديات والإعدادات) وشعار الفاتورة، في ملف واحد بامتداد
          .fastpos.
        </p>
        <a
          className="btn btn-primary gap-2 rounded-xl"
          href="/api/admin/backup"
          download
        >
          <Download className="size-4" />
          تنزيل نسخة احتياطية
        </a>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 font-black">
          <HardDriveDownload className="size-4 text-warning" />
          استعادة نسخة احتياطية
        </div>

        <div className="alert alert-warning rounded-2xl text-sm">
          <AlertTriangle className="size-5 shrink-0" />
          <span className="leading-6">
            الاستعادة تستبدل كل البيانات الحالية (المبيعات، القائمة، الموظفين،
            الورديات والإعدادات) ببيانات النسخة المرفوعة. تُحفظ نسخة أمان تلقائية
            قبل الاستبدال، وإذا كانت هناك وردية مفتوحة فستُستبدل أيضاً.
          </span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">
              ملف النسخة الاحتياطية
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".fastpos,.db,application/zip,application/x-sqlite3"
              className="file-input file-input-bordered w-full"
              disabled={pending}
              onChange={(event) =>
                setFile(event.target.files?.[0] ?? null)
              }
            />
            <span className="label-text-alt mt-2 text-base-content/45">
              اختر ملف .fastpos أو قاعدة بيانات .db — حتى 250 ميغابايت
            </span>
          </label>

          <label className="form-control w-full sm:max-w-sm">
            <span className="label-text mb-2 font-bold">كلمة مرور المدير</span>
            <input
              type="password"
              className="input input-bordered w-full"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              autoComplete="current-password"
            />
            <span className="label-text-alt mt-2 text-base-content/45">
              مطلوبة لتأكيد الاستعادة
            </span>
          </label>

          <ActionFeedback tone="error" message={error} />
          <ActionFeedback
            tone={
              result &&
              (result.replacedOpenShifts > 0 || Boolean(result.warning))
                ? "warning"
                : "success"
            }
            message={result ? resultMessage(result) : null}
          />

          <button
            type="submit"
            className="btn btn-warning gap-2 rounded-xl"
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                جاري الاستعادة...
              </>
            ) : (
              <>
                <HardDriveDownload className="size-4" />
                استعادة النسخة الاحتياطية
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
