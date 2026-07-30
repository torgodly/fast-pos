"use client";

import { useState, useTransition } from "react";
import {
  ArrowLeft,
  Delete,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { loginWithPin } from "@/app/actions/auth";

export function PinPad({ venueId, venueName }: { venueId: string; venueName: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function press(digit: string) {
    setError(null);
    setPin((prev) => (prev.length >= 6 ? prev : prev + digit));
  }

  function clear() {
    setPin("");
    setError(null);
  }

  function backspace() {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await loginWithPin(venueId, pin);
      if (result?.error) {
        setError(result.error);
        setPin("");
      }
    });
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="glass-panel card overflow-hidden">
        <div className="h-1.5 bg-gradient-to-l from-primary via-secondary to-accent" />
        <div className="card-body items-center p-5 sm:p-8">
          <div className="mb-1 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-7" />
          </div>
          <h1 className="card-title mt-2 text-2xl font-black sm:text-3xl">
            دخول {venueName}
          </h1>
          <p className="text-sm text-base-content/55">
            استخدم رمز الموظف للمتابعة
          </p>

          <div className="my-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl border border-base-300/70 bg-base-200/60 px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={`size-3 rounded-full transition-all ${
                  i < pin.length
                    ? "scale-110 bg-primary shadow-md shadow-primary/30"
                    : "bg-base-300"
                }`}
              />
            ))}
          </div>

          {error && (
            <div role="alert" className="alert alert-error alert-soft w-full text-sm">
              <span>{error}</span>
            </div>
          )}

          <div className="grid w-full grid-cols-3 gap-2.5 sm:gap-3">
            {keys.map((key) => {
              if (key === "clear") {
                return (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-ghost h-14 rounded-2xl text-error sm:h-16"
                    onClick={clear}
                    disabled={pending}
                    aria-label="مسح الرمز"
                  >
                    <RotateCcw className="size-5" />
                  </button>
                );
              }
              if (key === "back") {
                return (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-ghost h-14 rounded-2xl sm:h-16"
                    onClick={backspace}
                    disabled={pending}
                    aria-label="حذف رقم"
                  >
                    <Delete className="size-5" />
                  </button>
                );
              }
              return (
                <button
                  key={key}
                  type="button"
                  className="btn h-14 rounded-2xl border-base-300 bg-base-100 text-xl font-bold shadow-sm hover:border-primary/30 hover:bg-primary/5 sm:h-16"
                  onClick={() => press(key)}
                  disabled={pending}
                >
                  {key}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg mt-4 w-full rounded-2xl shadow-lg shadow-primary/20"
            onClick={submit}
            disabled={pending || pin.length < 4}
          >
            {pending ? (
              <>
                <LoaderCircle className="size-5 animate-spin" />
                جاري التحقق...
              </>
            ) : (
              <>
                دخول
                <ArrowLeft className="size-5" />
              </>
            )}
          </button>

          <div className="mt-3 flex items-center gap-2 text-xs text-base-content/45">
            <ShieldCheck className="size-4 text-success" />
            رمزك مشفّر ومحمي
          </div>
        </div>
      </div>
    </div>
  );
}
