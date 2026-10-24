"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import {
  quickCreateCustomer,
  type CustomerOption,
} from "@/app/actions/customers";

type SelectResult = { ok: true } | { error: string } | void;

export function CustomerSelect({
  customers,
  value,
  onSelect,
  disabled = false,
}: {
  customers: CustomerOption[];
  value: number | null;
  onSelect: (customerId: number | null) => SelectResult | Promise<SelectResult>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [created, setCreated] = useState<CustomerOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedId(value);
  }, [value]);

  const options = useMemo(() => {
    const seen = new Set(customers.map((customer) => customer.id));
    return [...customers, ...created.filter((customer) => !seen.has(customer.id))];
  }, [customers, created]);

  const selected = options.find((customer) => customer.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        (customer.phone ?? "").includes(query),
    );
  }, [options, search]);

  function close() {
    if (pending) return;
    setOpen(false);
    setCreating(false);
    setSearch("");
    setError(null);
    setCreateError(null);
  }

  function choose(customer: CustomerOption | null) {
    const previous = selectedId;
    setSelectedId(customer?.id ?? null);
    setError(null);
    startTransition(async () => {
      const result = await onSelect(customer?.id ?? null);
      if (result && "error" in result) {
        setSelectedId(previous);
        setError(result.error);
        return;
      }
      setOpen(false);
      setCreating(false);
      setSearch("");
    });
  }

  function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const previous = selectedId;
    setCreateError(null);
    startTransition(async () => {
      const result = await quickCreateCustomer({ name, phone, notes });
      if ("error" in result) {
        setCreateError(result.error);
        return;
      }
      setCreated((prev) => [...prev, result.customer]);
      setSelectedId(result.customer.id);
      const selectResult = await onSelect(result.customer.id);
      if (selectResult && "error" in selectResult) {
        setSelectedId(previous);
        setCreateError(selectResult.error);
        return;
      }
      setOpen(false);
      setCreating(false);
      setSearch("");
    });
  }

  return (
    <>
      <div className="flex gap-1">
        <button
          type="button"
          className="flex h-8 min-h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-200/40 px-2 text-xs disabled:opacity-50"
          disabled={disabled || pending}
          onClick={() => {
            setError(null);
            setCreateError(null);
            setCreating(false);
            setSearch("");
            setOpen(true);
          }}
        >
          <span className="flex min-w-0 items-center gap-1.5 font-bold">
            <UserRound className="size-3.5 shrink-0 text-base-content/55" />
            <span className="truncate">
              {selected ? selected.name : "بدون عميل"}
            </span>
          </span>
          <span
            className="shrink-0 font-mono text-[10px] text-base-content/45"
            dir="ltr"
          >
            {selected?.phone ?? "اختيار عميل"}
          </span>
        </button>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-base-300 bg-base-200/40 text-primary hover:bg-primary/10 disabled:opacity-50"
          disabled={disabled || pending}
          title="إضافة عميل"
          aria-label="إضافة عميل"
          onClick={() => {
            setError(null);
            setCreateError(null);
            setSearch("");
            setCreating(true);
            setOpen(true);
          }}
        >
          <Plus className="size-4" />
        </button>
      </div>

      {open ? (
        <dialog className="modal modal-open z-[60]">
          <div className="modal-box max-w-md rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-black">
                {creating ? "عميل جديد" : "اختيار العميل"}
              </h3>
              <button
                type="button"
                className="btn btn-square btn-ghost btn-sm"
                onClick={close}
                disabled={pending}
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>

            {creating ? (
              <form onSubmit={create} className="mt-3 space-y-3">
                <label className="form-control w-full">
                  <span className="label-text mb-1 font-bold">اسم العميل</span>
                  <input
                    name="name"
                    autoFocus
                    required
                    className="input input-bordered input-sm w-full"
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text mb-1 font-bold">
                    الهاتف (اختياري)
                  </span>
                  <input
                    name="phone"
                    dir="ltr"
                    className="input input-bordered input-sm w-full text-left font-mono"
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text mb-1 font-bold">
                    ملاحظات (اختياري)
                  </span>
                  <textarea
                    name="notes"
                    rows={2}
                    className="textarea textarea-bordered textarea-sm w-full"
                  />
                </label>
                {createError ? (
                  <p className="rounded-lg bg-error/10 px-2 py-1.5 text-xs font-bold text-error">
                    {createError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setCreating(false);
                      setCreateError(null);
                    }}
                    disabled={pending}
                  >
                    رجوع
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm gap-1"
                    disabled={pending}
                  >
                    {pending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    إضافة واختيار
                  </button>
                </div>
              </form>
            ) : (
              <>
                <label className="mt-3 flex items-center gap-2 rounded-lg border border-base-300 px-2">
                  <Search className="size-4 shrink-0 text-base-content/45" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="ابحث بالاسم أو الهاتف"
                    className="h-9 w-full bg-transparent text-sm outline-none"
                  />
                </label>

                {error ? (
                  <p className="mt-2 rounded-lg bg-error/10 px-2 py-1.5 text-xs font-bold text-error">
                    {error}
                  </p>
                ) : null}

                <ul className="mt-2 max-h-64 divide-y divide-base-300/60 overflow-y-auto rounded-lg border border-base-300">
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start hover:bg-base-200/60"
                      disabled={pending}
                      onClick={() => choose(null)}
                    >
                      <span className="text-sm font-bold text-base-content/60">
                        بدون عميل
                      </span>
                      {selectedId === null ? (
                        <Check className="size-4 text-primary" />
                      ) : null}
                    </button>
                  </li>
                  {filtered.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start hover:bg-base-200/60"
                        disabled={pending}
                        onClick={() => choose(customer)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black">
                            {customer.name}
                          </span>
                          {customer.phone ? (
                            <span
                              className="block font-mono text-[11px] text-base-content/45"
                              dir="ltr"
                            >
                              {customer.phone}
                            </span>
                          ) : null}
                        </span>
                        {selectedId === customer.id ? (
                          <Check className="size-4 shrink-0 text-primary" />
                        ) : null}
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 ? (
                    <li className="px-3 py-6 text-center text-xs text-base-content/45">
                      لا يوجد عملاء مطابقون
                    </li>
                  ) : null}
                </ul>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm gap-1"
                    disabled={pending}
                    onClick={() => {
                      setCreating(true);
                      setError(null);
                    }}
                  >
                    <Plus className="size-4" />
                    عميل جديد
                  </button>
                </div>
              </>
            )}
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={close}>
              إغلاق
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
