"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Delete,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@/lib/auth/pin";

type Candidate = { id: number; name: string; role: string };

export function PinPad({
  venueId,
  venueName,
}: {
  venueId: string;
  venueName: string;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function login(currentPin: string, userId?: number) {
    if (
      submittingRef.current ||
      currentPin.length < PIN_MIN_LENGTH ||
      currentPin.length > PIN_MAX_LENGTH
    ) {
      return;
    }
    submittingRef.current = true;

    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch("/api/auth/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            venueId,
            pin: currentPin,
            ...(userId != null ? { userId } : {}),
          }),
        });
        const result = await response.json();
        if (result.ok && result.needUserPick && Array.isArray(result.candidates)) {
          setCandidates(result.candidates);
          return;
        }
        if (result.ok && result.redirectTo) {
          window.location.href = result.redirectTo;
          return;
        }
        setError(result.error ?? "رمز الدخول غير صحيح");
        setPin("");
        setCandidates(null);
      } catch {
        setError("تعذر الاتصال بالسيرفر");
        setPin("");
        setCandidates(null);
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function press(digit: string) {
    if (pending || submittingRef.current || candidates) return;
    setError(null);
    setPin((prev) => {
      if (prev.length >= PIN_MAX_LENGTH) return prev;
      return prev + digit;
    });
  }

  function clear() {
    if (pending || submittingRef.current) return;
    setPin("");
    setError(null);
    setCandidates(null);
  }

  function backspace() {
    if (pending || submittingRef.current || candidates) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  const canSubmit =
    pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH;

  if (candidates) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="glass-panel card">
          <div className="h-1 bg-gradient-to-l from-primary via-secondary to-accent" />
          <div className="card-body gap-3 p-4 sm:p-6">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary sm:size-12">
              <UserRound className="size-5 sm:size-6" />
            </div>
            <h1 className="card-title text-xl font-black sm:text-2xl">
              من أنت؟
            </h1>
            <p className="text-xs text-base-content/55 sm:text-sm">
              أكثر من موظف يستخدم نفس الرمز — اختر اسمك للمتابعة
            </p>
            {error && (
              <div
                role="alert"
                className="alert alert-error alert-soft w-full py-2 text-sm"
              >
                <span>{error}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {candidates.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="btn btn-outline h-auto min-h-12 justify-start gap-3 rounded-xl py-3"
                  disabled={pending}
                  onClick={() => login(pin, person.id)}
                >
                  <UserRound className="size-4 shrink-0" />
                  <span className="font-bold">{person.name}</span>
                  <span className="ms-auto text-xs opacity-60">
                    {person.role === "waiter" ? "سفرادجي" : "كاشير"}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-1"
              onClick={clear}
              disabled={pending}
            >
              رجوع وإعادة إدخال الرمز
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            أدخل الرمز (4 إلى 6 أرقام) ثم اضغط دخول
          </p>

          <div
            className="my-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-base-300/70 bg-base-200/60 px-4 sm:min-h-14 sm:gap-3"
            dir="ltr"
          >
            {Array.from({ length: PIN_MAX_LENGTH }).map((_, i) => (
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
          {pin.length > 0 ? (
            <p className="font-mono text-sm font-bold tabular-nums tracking-[0.35em] text-base-content/50" dir="ltr">
              {"•".repeat(pin.length)}
            </p>
          ) : null}

          {error && (
            <div
              role="alert"
              className="alert alert-error alert-soft w-full py-2 text-sm"
            >
              <span>{error}</span>
            </div>
          )}

          <div className="grid w-full grid-cols-3 gap-2" dir="ltr">
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
            disabled={pending || !canSubmit}
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
