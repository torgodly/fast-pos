"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export type ActionFeedbackTone =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "pending";

export function ActionFeedback({
  tone,
  message,
}: {
  tone: ActionFeedbackTone;
  message: string | null;
}) {
  if (!message) return null;

  const styles: Record<
    Exclude<ActionFeedbackTone, "pending"> | "pending",
    string
  > = {
    success: "alert-success",
    error: "alert-error",
    warning: "alert-warning",
    info: "alert-info",
    pending: "alert-info",
  };

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "error"
        ? XCircle
        : tone === "warning"
          ? AlertTriangle
          : Info;

  return (
    <div
      role="status"
      className={`alert ${styles[tone]} rounded-2xl text-sm font-bold shadow-sm`}
    >
      <Icon className="size-5 shrink-0" />
      <span className="leading-6">{message}</span>
    </div>
  );
}
