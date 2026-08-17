"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MessageSquareText, Trash2 } from "lucide-react";

const PRESETS = [
  "بدون بصل",
  "بدون صلصة",
  "حار",
  "زيادة جبن",
  "نصف كمية",
  "ملاحظة خاصة",
] as const;

export const MAX_KITCHEN_NOTE_LEN = 80;

export type KitchenNoteTarget = {
  key: string | number;
  name: string;
  note?: string | null;
};

export function KitchenNoteDialog({
  target,
  pending = false,
  onClose,
  onSave,
}: {
  target: KitchenNoteTarget | null;
  pending?: boolean;
  onClose: () => void;
  onSave: (key: string | number, note: string) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!target) return;
    setDraft(target.note?.trim() ?? "");
  }, [target]);

  if (!target) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(target!.key, draft.trim().slice(0, MAX_KITCHEN_NOTE_LEN));
    onClose();
  }

  function applyPreset(preset: string) {
    if (preset === "ملاحظة خاصة") {
      setDraft("");
      return;
    }
    setDraft((prev) => {
      const next = prev.trim()
        ? prev.includes(preset)
          ? prev
          : `${prev} · ${preset}`
        : preset;
      return next.slice(0, MAX_KITCHEN_NOTE_LEN);
    });
  }

  return (
    <dialog className="modal modal-open modal-bottom sm:modal-middle">
      <div className="modal-box max-w-lg rounded-t-3xl sm:rounded-3xl">
        <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-secondary/15 text-secondary">
          <MessageSquareText className="size-6" />
        </div>
        <h3 className="text-xl font-black">ملاحظة للمطبخ</h3>
        <p className="mt-1 text-sm text-base-content/55">
          للصنف: <span className="font-black text-base-content">{target.name}</span>
        </p>
        <p className="mt-0.5 text-xs text-base-content/45">
          تظهر على تذكرة المطبخ تحت اسم الصنف
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="form-control w-full">
            <span className="label-text mb-1.5 font-bold">نص الملاحظة</span>
            <textarea
              autoFocus
              value={draft}
              maxLength={MAX_KITCHEN_NOTE_LEN}
              rows={3}
              disabled={pending}
              placeholder="مثال: بدون بصل · حار"
              className="textarea textarea-bordered w-full text-base leading-6"
              onChange={(event) =>
                setDraft(event.target.value.slice(0, MAX_KITCHEN_NOTE_LEN))
              }
            />
            <span className="mt-1 text-end text-[11px] text-base-content/40">
              {draft.length}/{MAX_KITCHEN_NOTE_LEN}
            </span>
          </label>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="btn btn-sm rounded-xl border border-base-300 bg-base-100"
                disabled={pending}
                onClick={() => applyPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="modal-action mt-4 flex-col gap-2 sm:flex-row">
            {draft.trim() ? (
              <button
                type="button"
                className="btn btn-ghost gap-2 rounded-xl text-error sm:me-auto"
                disabled={pending}
                onClick={() => {
                  onSave(target.key, "");
                  onClose();
                }}
              >
                <Trash2 className="size-4" />
                حذف الملاحظة
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost rounded-xl"
              disabled={pending}
              onClick={onClose}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="btn btn-secondary gap-2 rounded-xl"
              disabled={pending}
            >
              <MessageSquareText className="size-4" />
              حفظ للمطبخ
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" onClick={onClose}>
          إغلاق
        </button>
      </form>
    </dialog>
  );
}
