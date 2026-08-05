"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import type { ActionFeedbackTone } from "@/components/ActionFeedback";

type ToastItem = {
  id: number;
  tone: ActionFeedbackTone;
  message: string;
};

type ToastContextValue = {
  showToast: (tone: ActionFeedbackTone, message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const styles: Record<ActionFeedbackTone, string> = {
  success: "alert-success",
  error: "alert-error",
  warning: "alert-warning",
  info: "alert-info",
  pending: "alert-info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((tone: ActionFeedbackTone, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, tone === "error" ? 5000 : 3500);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => {
          const Icon =
            toast.tone === "success"
              ? CheckCircle2
              : toast.tone === "error"
                ? XCircle
                : toast.tone === "warning"
                  ? AlertTriangle
                  : Info;
          return (
            <div
              key={toast.id}
              role="status"
              className={`alert pointer-events-auto ${styles[toast.tone]} w-full max-w-md rounded-2xl text-sm font-bold shadow-lg`}
            >
              <Icon className="size-5 shrink-0" />
              <span className="leading-6">{toast.message}</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                onClick={() =>
                  setToasts((prev) => prev.filter((t) => t.id !== toast.id))
                }
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
