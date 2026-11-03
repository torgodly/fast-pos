"use client";

import type { ReportDocument } from "@/lib/print/templates/types";

const DOCUMENT_LABELS: Record<ReportDocument, string> = {
  receipt: "إيصال الدفع",
  kitchen: "تذكرة المطبخ",
  shift: "تقرير الوردية",
  items: "تذكرة الأصناف",
  sales: "تقرير المبيعات",
  purchases: "تقرير المشتريات",
};

type EditorToolbarProps = {
  document: ReportDocument;
  documents: ReportDocument[];
  dirty: boolean;
  isDefault: boolean;
  canUndo: boolean;
  canRedo: boolean;
  sampleMode: "sample" | "blank";
  advanced: boolean;
  printerId: number;
  printers: Array<{
    id: number;
    name: string;
    connectionType: "local" | "network";
  }>;
  onDocumentChange: (document: ReportDocument) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onPrinterChange: (id: number) => void;
  onTestPrint: () => void;
  onDownloadPdf: () => void;
  onSampleModeChange: (mode: "sample" | "blank") => void;
  onToggleAdvanced: () => void;
};

export function EditorToolbar({
  document,
  documents,
  dirty,
  isDefault,
  canUndo,
  canRedo,
  sampleMode,
  advanced,
  printerId,
  printers,
  onDocumentChange,
  onSave,
  onUndo,
  onRedo,
  onPrinterChange,
  onTestPrint,
  onDownloadPdf,
  onSampleModeChange,
  onToggleAdvanced,
}: EditorToolbarProps) {
  return (
    <div className="space-y-3">
      <div role="tablist" className="tabs tabs-boxed w-fit">
        {documents.map((doc) => (
          <button
            key={doc}
            type="button"
            role="tab"
            aria-selected={doc === document}
            className={`tab ${doc === document ? "tab-active" : ""}`}
            onClick={() => onDocumentChange(doc)}
          >
            {DOCUMENT_LABELS[doc]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-lg" onClick={onSave}>
          حفظ التصميم
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={onUndo}
          disabled={!canUndo}
        >
          تراجع
        </button>
        <button
          type="button"
          className="btn btn-lg"
          onClick={onRedo}
          disabled={!canRedo}
        >
          إعادة
        </button>
        <div className="join">
          <button
            type="button"
            className={`btn join-item btn-lg ${sampleMode === "sample" ? "btn-active" : ""}`}
            aria-pressed={sampleMode === "sample"}
            onClick={() => onSampleModeChange("sample")}
          >
            بيانات تجريبية
          </button>
          <button
            type="button"
            className={`btn join-item btn-lg ${sampleMode === "blank" ? "btn-active" : ""}`}
            aria-pressed={sampleMode === "blank"}
            onClick={() => onSampleModeChange("blank")}
          >
            بيانات فارغة
          </button>
        </div>
        <button
          type="button"
          className={`btn btn-lg ${advanced ? "btn-active" : ""}`}
          aria-pressed={advanced}
          onClick={onToggleAdvanced}
        >
          متقدم
        </button>
        <div className="join">
          <select
            className="select select-bordered join-item select-lg"
            aria-label="طابعة الاختبار"
            value={printerId}
            onChange={(event) => onPrinterChange(Number(event.target.value))}
          >
            {printers.length === 0 && <option value={0}>لا طابعات</option>}
            {printers.map((printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary join-item btn-lg"
            onClick={onTestPrint}
          >
            طباعة تجريبية
          </button>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-lg"
          onClick={onDownloadPdf}
          title="تنزيل معاينة التصميم كملف PDF"
        >
          تنزيل PDF
        </button>
        {dirty && (
          <span className="badge badge-warning badge-lg">تغييرات غير محفوظة</span>
        )}
        {isDefault && (
          <span className="badge badge-ghost badge-lg">التصميم الافتراضي</span>
        )}
      </div>
    </div>
  );
}
