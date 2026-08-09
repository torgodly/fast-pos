"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Delete,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

const PIN_LENGTH = 4;

export function PinPad({
  venueId,
  venueName,
}: {
  venueId: string;
  venueName: string;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function login(currentPin: string) {
    if (submittingRef.current || currentPin.length < PIN_LENGTH) return;
    submittingRef.current = true;

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/auth/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId, pin: currentPin }),
        });
        const result = await response.json();
        if (result.ok && result.redirectTo) {
          window.location.href = result.redirectTo;
          return;
        }
        setError(result.error ?? "رمز الدخول غير صحيح");
        setPin("");
      } catch {
        setError("تعذر الاتصال بالسيرفر");
        setPin("");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function press(digit: string) {
    if (pending || submittingRef.current) return;
    setError(null);
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + digit;
      if (next.length === PIN_LENGTH) {
        queueMicrotask(() => login(next));
      }
      return next;
    });
  }

  function clear() {
    if (pending || submittingRef.current) return;
    setPin("");
    setError(null);
  }

  function backspace() {
    if (pending || submittingRef.current) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="glass-panel card">
        <div className="h-1 bg-gradient-to-l from-primary via-secondary to-accent" />
        <div className="card-body items-center gap-2 p-4 sm:gap-3 sm:p-6">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary sm:size-12">
            <KeyRound className="size-5 sm:size-6" />
          </div>
          <h1 className="card-title text-xl font-black sm:text-2xl">
            دخول {venueName}
          </h1>
          <p className="text-xs text-base-content/55 sm:text-sm">
            أدخل الرمز المكوّن من 4 أرقام
          </p>

          <div className="my-2 flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-base-300/70 bg-base-200/60 px-4 sm:min-h-14">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`size-2.5 rounded-full transition-all sm:size-3 ${
                  i < pin.length
                    ? "scale-110 bg-primary shadow-md shadow-primary/30"
                    : "bg-base-300"
                }`}
              />
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="alert alert-error alert-soft w-full py-2 text-sm"
            >
              <span>{error}</span>
            </div>
          )}

          <div className="grid w-full grid-cols-3 gap-2">
            {keys.map((key) => {
              if (key === "clear") {
                return (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-ghost h-12 min-h-12 rounded-xl text-error sm:h-14"
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
                    className="btn btn-ghost h-12 min-h-12 rounded-xl sm:h-14"
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
                  className="btn h-12 min-h-12 rounded-xl border-base-300 bg-base-100 text-lg font-bold shadow-sm hover:border-primary/30 hover:bg-primary/5 sm:h-14 sm:text-xl"
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
            className="btn btn-primary btn-lg mt-1 w-full rounded-2xl shadow-lg shadow-primary/20"
            onClick={() => login(pin)}
            disabled={pending || pin.length < PIN_LENGTH}
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

          <div className="flex items-center gap-2 text-xs text-base-content/45">
            <ShieldCheck className="size-4 text-success" />
            رمزك مشفّر ومحمي
          </div>
        </div>
      </div>
    </div>
  );
}
