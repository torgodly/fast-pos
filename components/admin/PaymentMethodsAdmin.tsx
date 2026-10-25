"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Banknote,
  Clock3,
  Lock,
  Pencil,
  Plus,
  WalletCards,
} from "lucide-react";
import {
  deletePaymentMethod,
  setPaymentMethodActive,
  upsertPaymentMethod,
} from "@/app/actions/payment-methods";
import { AdminModal } from "@/components/admin/AdminModal";
import { DeleteConfirmButton } from "@/components/admin/DeleteConfirmButton";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { ActionFeedback } from "@/components/ActionFeedback";

export type PaymentMethodAdminRow = {
  id: number;
  code: string;
  name: string;
  deferred: boolean;
  cashDrawer: boolean;
  builtIn: boolean;
  active: boolean;
  usageCount: number;
};

type MethodModal =
  | { mode: "create" }
  | { mode: "edit"; method: PaymentMethodAdminRow }
  | null;

export function PaymentMethodsAdmin({
  methods,
}: {
  methods: PaymentMethodAdminRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<MethodModal>(null);
  const [deferred, setDeferred] = useState(false);
  const [cashDrawer, setCashDrawer] = useState(false);

  const editing = modal?.mode === "edit" ? modal.method : null;
  const flagsLocked = !!editing?.builtIn;

  function closeModal() {
    if (pending) return;
    setModal(null);
    setError(null);
  }

  function openCreate() {
    setError(null);
    setDeferred(false);
    setCashDrawer(false);
    setModal({ mode: "create" });
  }

  function openEdit(method: PaymentMethodAdminRow) {
    setError(null);
    setDeferred(method.deferred);
    setCashDrawer(method.cashDrawer);
    setModal({ mode: "edit", method });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await upsertPaymentMethod(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      closeModal();
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">
            إجمالي طرق الدفع
          </p>
          <p className="mt-1 text-2xl font-black">{methods.length}</p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">نشطة للبيع</p>
          <p className="mt-1 text-2xl font-black text-success">
            {methods.filter((method) => method.active).length}
          </p>
        </div>
        <div className="premium-card rounded-2xl p-4">
          <p className="text-xs font-bold text-base-content/45">
            طرق آجلة (تحجز الطلب)
          </p>
          <p className="mt-1 text-2xl font-black text-warning">
            {methods.filter((method) => method.deferred).length}
          </p>
        </div>
      </div>

      <section className="premium-card card">
        <div className="card-body gap-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <WalletCards className="size-5" />
              </span>
              <div>
                <h3 className="font-black">طرق الدفع</h3>
                <p className="text-xs text-base-content/45">
                  تظهر الطرق النشطة في شاشة الكاشير والبيع السريع
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              onClick={openCreate}
            >
              <Plus className="size-4" />
              إضافة طريقة دفع
            </button>
          </div>

          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-6 text-base-content/70">
            <span className="font-black text-warning">طريقة «آجل»:</span> تُبقي
            الفاتورة مفتوحة ولا تُحصّل المبلغ. تُستخدم لطلبات الهاتف وتطبيقات
            التوصيل مثل <span className="font-black">بريستو</span> — يستلم
            الكاشير الطلب لاحقاً ويختار طريقة الدفع الفعلية عند وصول العميل.
          </div>

          <div className="overflow-x-auto rounded-2xl border border-base-300/60">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>طريقة الدفع</th>
                  <th>النوع</th>
                  <th>نقدية الدرج</th>
                  <th>الاستخدام</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {methods.map((method) => (
                  <tr
                    key={method.id}
                    className={!method.active ? "opacity-50" : ""}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{method.name}</span>
                        {method.builtIn ? (
                          <span className="badge badge-primary badge-soft badge-sm gap-1">
                            <Lock className="size-3" />
                            أساسية
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {method.deferred ? (
                        <span className="badge badge-warning badge-soft badge-sm gap-1">
                          <Clock3 className="size-3" />
                          آجل — يحجز الطلب
                        </span>
                      ) : (
                        <span className="badge badge-ghost badge-sm">عادية</span>
                      )}
                    </td>
                    <td>
                      {method.cashDrawer ? (
                        <span className="badge badge-success badge-soft badge-sm gap-1">
                          <Banknote className="size-3" />
                          تُحتسب
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/40">—</span>
                      )}
                    </td>
                    <td className="text-xs text-base-content/60">
                      {method.usageCount > 0
                        ? `${method.usageCount} فاتورة`
                        : "غير مستخدمة"}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm ${
                          method.active
                            ? "badge-success badge-soft"
                            : "badge-ghost"
                        }`}
                      >
                        {method.active ? "نشطة" : "معطّلة"}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-square btn-ghost btn-sm"
                          title="تعديل"
                          onClick={() => openEdit(method)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <ToggleActiveButton
                          active={method.active}
                          onToggle={async () => {
                            const result = await setPaymentMethodActive(
                              method.id,
                              !method.active,
                            );
                            if (result && "error" in result) {
                              window.alert(result.error);
                            }
                          }}
                        />
                        {method.builtIn ? null : (
                          <DeleteConfirmButton
                            itemName={method.name}
                            onDelete={() => deletePaymentMethod(method.id)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {methods.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center opacity-60">
                      لا توجد طرق دفع بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-base-content/45">
            الطرق المستخدمة في فواتير سابقة لا يمكن حذفها — عطّلها إن لم تعد
            بحاجة إليها. طرق الدفع الأساسية محمية من الحذف.
          </p>
        </div>
      </section>

      <AdminModal
        open={modal !== null}
        title={editing ? "تعديل طريقة دفع" : "إضافة طريقة دفع"}
        onClose={closeModal}
        pending={pending}
      >
        <form
          key={editing ? `edit-${editing.id}` : "create"}
          onSubmit={submit}
          className="space-y-4"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          <label className="form-control w-full">
            <span className="label-text mb-2 font-bold">اسم طريقة الدفع</span>
            <input
              name="name"
              defaultValue={editing?.name ?? ""}
              placeholder="نقدي، بطاقة، بريستو، تحويل بنكي…"
              className="input input-bordered w-full"
              required
            />
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
            <input
              type="checkbox"
              name="deferred"
              className="checkbox checkbox-warning checkbox-sm mt-0.5"
              checked={deferred}
              disabled={flagsLocked}
              onChange={(event) => {
                setDeferred(event.target.checked);
                if (event.target.checked) setCashDrawer(false);
              }}
            />
            <span>
              <span className="block text-sm font-black">آجل — يحجز الطلب</span>
              <span className="mt-0.5 block text-xs leading-5 text-base-content/55">
                لا تُسجّل الفاتورة مدفوعة ولا تُطبع فاتورة دفع. تُغلق لاحقاً عند
                استلام العميل واختيار طريقة الدفع الفعلية.
              </span>
            </span>
          </label>

          <label
            className={`flex items-start gap-3 rounded-xl border border-base-300 p-3 ${
              deferred || flagsLocked
                ? "cursor-not-allowed opacity-55"
                : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              name="cashDrawer"
              className="checkbox checkbox-success checkbox-sm mt-0.5"
              checked={cashDrawer}
              disabled={deferred || flagsLocked}
              onChange={(event) => setCashDrawer(event.target.checked)}
            />
            <span>
              <span className="block text-sm font-black">
                تُحتسب ضمن نقدية الدرج
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-base-content/55">
                فعّلها فقط للطرق التي تصل نقداً إلى الدرج — تؤثر على النقد
                المتوقع في إغلاق الوردية.
              </span>
            </span>
          </label>

          {flagsLocked ? (
            <div className="rounded-xl bg-base-200/70 px-3 py-2 text-xs text-base-content/60">
              النوع ونقدية الدرج لطريقة الدفع الأساسية ثابتة لحماية تقارير
              الورديات — يمكنك تعديل الاسم فقط.
            </div>
          ) : null}

          {deferred ? (
            <div className="rounded-xl bg-warning/10 px-3 py-2 text-xs leading-6 text-base-content/65">
              عند اختيار هذه الطريقة سيبقى الطلب مفتوحاً باسم «آجل» في الشاشة
              الرئيسية، ويستطيع الكاشير استلامه لاحقاً واختيار نقدي أو بطاقة أو
              أي طريقة أخرى.
            </div>
          ) : null}

          <ActionFeedback tone="error" message={error} />
          <div className="modal-action mt-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeModal}
              disabled={pending}
            >
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {editing ? "حفظ التعديلات" : "إضافة"}
            </button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
