import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";
import type { VenueId } from "@/lib/types";

export const AUDIT_KINDS = [
  "kitchen",
  "receipt",
  "reprint",
  "preview",
  "x_report",
  "z_report",
  "report",
  "test",
  "invoice_edit",
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];

export const AUDIT_KIND_LABELS: Record<AuditKind, string> = {
  kitchen: "مطبخ",
  receipt: "فاتورة دفع",
  reprint: "إعادة طباعة",
  preview: "معاينة فاتورة",
  x_report: "تقرير X",
  z_report: "تقرير Z",
  report: "تقرير إدارة",
  test: "اختبار طابعة",
  invoice_edit: "تعديل فاتورة",
};

export function isAuditKind(value: string): value is AuditKind {
  return (AUDIT_KINDS as readonly string[]).includes(value);
}

export function recordAudit(input: {
  userId?: number | null;
  userName: string;
  role: string;
  venueId?: string | null;
  kind: AuditKind;
  orderId?: number | null;
  printerName?: string | null;
  success: boolean;
  detail: string;
}) {
  db.insert(auditEvents)
    .values({
      userId: input.userId ?? null,
      userName: input.userName,
      role: input.role,
      venueId: input.venueId ?? null,
      kind: input.kind,
      orderId: input.orderId ?? null,
      printerName: input.printerName ?? null,
      success: input.success,
      detail: input.detail,
    })
    .run();
}

export function auditPrintOutcome(
  printResult: {
    printOk?: boolean;
    browserPrint?: boolean;
    printError?: string;
  },
  printerName: string,
) {
  if (printResult.browserPrint) {
    return {
      success: true,
      detail: `طباعة من المتصفح — ${printerName}`,
    };
  }
  if (printResult.printOk) {
    return {
      success: true,
      detail: `طُبعت على ${printerName}`,
    };
  }
  return {
    success: false,
    detail: printResult.printError
      ? `${printerName}: ${printResult.printError}`
      : `فشلت الطباعة على ${printerName}`,
  };
}

export function roleLabel(role: string) {
  switch (role) {
    case "admin":
      return "إدارة";
    case "waiter":
      return "سفرادجي";
    case "cashier":
      return "كاشير";
    default:
      return role;
  }
}

export function venueLabel(venueId: string | null) {
  if (venueId === "restaurant") return "مطعم";
  if (venueId === "cafe") return "كافيه";
  return "—";
}

export type AuditSession = {
  userId: number;
  name: string;
  role: string;
};

export function recordSessionAudit(
  session: AuditSession,
  input: Omit<Parameters<typeof recordAudit>[0], "userId" | "userName" | "role"> & {
    venueId?: VenueId | string | null;
  },
) {
  recordAudit({
    ...input,
    userId: session.userId,
    userName: session.name,
    role: session.role,
  });
}
