"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resetReportTemplate,
  saveReportTemplate,
  testPrintReportTemplate,
} from "@/app/actions/report-templates";
import { downloadPdf } from "@/lib/client/download-pdf";
import { blankSample, type TemplateCommit } from "@/lib/print/templates/element-ops";
import { DEFAULT_REPORT_TEMPLATES } from "@/lib/print/templates/defaults";
import { parseReportTemplateJson } from "@/lib/print/templates/schema";
import type {
  DocumentData,
  ReportDocument,
  ReportTemplate,
} from "@/lib/print/templates/types";
import { AdvancedPanel } from "./AdvancedPanel";
import { EditorToolbar } from "./EditorToolbar";
import { ElementInspector } from "./ElementInspector";
import { ElementPalette } from "./ElementPalette";
import { GridCanvas } from "./GridCanvas";
import { useTemplateEditor } from "./useTemplateEditor";

type ReportDesignAdminProps = {
  document: ReportDocument;
  documents: ReportDocument[];
  template: ReportTemplate;
  templateJson: string;
  isDefault: boolean;
  sample: DocumentData;
  printers: Array<{
    id: number;
    name: string;
    connectionType: "local" | "network";
  }>;
};

function jsonVersion(json: string): number | null {
  try {
    const value = JSON.parse(json) as { version?: unknown };
    return typeof value.version === "number" ? value.version : null;
  } catch {
    return null;
  }
}

export function ReportDesignAdmin(props: ReportDesignAdminProps) {
  const router = useRouter();
  const editor = useTemplateEditor(props.template);
  const [selected, setSelected] = useState<string | null>(
    props.template.elements[0]?.id ?? null,
  );
  const [sampleMode, setSampleMode] = useState<"sample" | "blank">("sample");
  const [advanced, setAdvanced] = useState(false);
  const [jsonText, setJsonText] = useState(props.templateJson);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingDocument, setPendingDocument] = useState<ReportDocument | null>(
    null,
  );
  const [printerId, setPrinterId] = useState(props.printers[0]?.id ?? 0);
  const saving = useRef(false);
  const printing = useRef(false);
  const downloading = useRef(false);

  const template = editor.template;
  const data = sampleMode === "sample" ? props.sample : blankSample(props.sample);

  useEffect(() => {
    if (!editor.dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  const commit: TemplateCommit = (next, options) => {
    editor.commit(next, options);
    keepSelection(next);
    setError(null);
    setMessage(null);
  };

  // Imports, resets, and JSON edits can replace every element id. Keep the
  // current selection while it still exists; otherwise fall back to the first
  // element so the inspector never points at a deleted id.
  function keepSelection(next: ReportTemplate) {
    setSelected((current) =>
      current && next.elements.some((element) => element.id === current)
        ? current
        : next.elements[0]?.id ?? null,
    );
  }

  function changeDocument(next: ReportDocument) {
    if (next === props.document) return;
    if (editor.dirty) {
      setPendingDocument(next);
      return;
    }
    router.push(`/admin/reports/design?doc=${next}`);
  }

  function confirmSwitch() {
    const next = pendingDocument;
    setPendingDocument(null);
    if (next) router.push(`/admin/reports/design?doc=${next}`);
  }

  async function save() {
    if (saving.current) return;
    saving.current = true;
    try {
      const snapshot = template;
      let result: Awaited<ReturnType<typeof saveReportTemplate>>;
      try {
        result = await saveReportTemplate(
          props.document,
          JSON.stringify(snapshot),
        );
      } catch {
        setError("تعذر حفظ التصميم، حاول مجدداً");
        setMessage(null);
        return;
      }
      if ("error" in result) {
        setError(result.error);
        setMessage(null);
        return;
      }
      editor.markSaved(snapshot);
      setJsonText(JSON.stringify(snapshot, null, 2));
      setError(null);
      setMessage("تم حفظ التصميم");
      router.refresh();
    } finally {
      saving.current = false;
    }
  }

  async function reset() {
    let result: Awaited<ReturnType<typeof resetReportTemplate>>;
    try {
      result = await resetReportTemplate(props.document);
    } catch {
      setConfirmReset(false);
      setError("تعذر استعادة التصميم، حاول مجدداً");
      setMessage(null);
      return;
    }
    setConfirmReset(false);
    if ("error" in result) {
      setError(result.error);
      setMessage(null);
      return;
    }
    const fallback = structuredClone(DEFAULT_REPORT_TEMPLATES[props.document]);
    editor.replace(fallback);
    editor.markSaved(fallback);
    keepSelection(fallback);
    setJsonText(JSON.stringify(fallback, null, 2));
    setError(null);
    setMessage("تمت استعادة التصميم الافتراضي");
    router.refresh();
  }

  async function testPrint() {
    if (!printerId) {
      setError("اختر طابعة أولاً");
      setMessage(null);
      return;
    }
    if (printing.current) return;
    printing.current = true;
    try {
      let result: Awaited<ReturnType<typeof testPrintReportTemplate>>;
      try {
        result = await testPrintReportTemplate(
          props.document,
          JSON.stringify(template),
          printerId,
        );
      } catch {
        setError("تعذر إرسال الطباعة التجريبية، حاول مجدداً");
        setMessage(null);
        return;
      }
      if ("error" in result) {
        setError(result.error);
        setMessage(null);
        return;
      }
      setError(null);
      setMessage(result.message);
    } finally {
      printing.current = false;
    }
  }

  async function downloadDesignPdf() {
    if (downloading.current) return;
    downloading.current = true;
    try {
      const result = await downloadPdf({
        document: props.document,
        source: "design",
        template: JSON.stringify(template),
      });
      if ("error" in result) {
        setError(result.error);
        setMessage(null);
        return;
      }
      setError(null);
      setMessage(`تم تنزيل ${result.filename}`);
    } finally {
      downloading.current = false;
    }
  }

  function applyJson() {
    const wasV1 = jsonVersion(jsonText) === 1;
    const result = parseReportTemplateJson(jsonText, props.document);
    if (!result.ok) {
      setError(result.errors.join("\n"));
      setMessage(null);
      return;
    }
    editor.replace(result.template);
    keepSelection(result.template);
    setJsonText(JSON.stringify(result.template, null, 2));
    setError(null);
    setMessage(
      wasV1
        ? "تم ترحيل تصميم الإصدار الأول وتطبيقه"
        : "تم تطبيق التصميم من JSON",
    );
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("تعذر قراءة الملف");
      setMessage(null);
      return;
    }
    const wasV1 = jsonVersion(text) === 1;
    const result = parseReportTemplateJson(text, props.document);
    if (!result.ok) {
      setError(result.errors.join("\n"));
      setMessage(null);
      return;
    }
    editor.replace(result.template);
    keepSelection(result.template);
    setJsonText(JSON.stringify(result.template, null, 2));
    setError(null);
    setMessage(
      `تم استيراد ${file.name}${wasV1 ? " — تم ترحيل v1" : ""}`,
    );
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(template, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `fastpos-${props.document}.fprep`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleAdvanced() {
    if (!advanced) setJsonText(JSON.stringify(template, null, 2));
    setAdvanced(!advanced);
  }

  return (
    <div className="space-y-5">
      <EditorToolbar
        document={props.document}
        documents={props.documents}
        dirty={editor.dirty}
        isDefault={props.isDefault}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        sampleMode={sampleMode}
        advanced={advanced}
        printerId={printerId}
        printers={props.printers}
        onDocumentChange={changeDocument}
        onSave={save}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onPrinterChange={setPrinterId}
        onTestPrint={testPrint}
        onDownloadPdf={downloadDesignPdf}
        onSampleModeChange={setSampleMode}
        onToggleAdvanced={toggleAdvanced}
      />

      {error && (
        <div className="alert alert-error whitespace-pre-line text-sm">{error}</div>
      )}
      {message && <div className="alert alert-success text-sm">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <ElementPalette
            template={template}
            defaults={DEFAULT_REPORT_TEMPLATES[props.document]}
            onCommit={commit}
          />
          <GridCanvas
            template={template}
            data={data}
            selectedId={selected}
            onSelect={setSelected}
            onCommit={commit}
            onBlocked={(message) => {
              setError(message);
              setMessage(null);
            }}
          />
        </div>
        <ElementInspector
          template={template}
          defaults={DEFAULT_REPORT_TEMPLATES[props.document]}
          selectedId={selected}
          onCommit={commit}
          onSelect={setSelected}
        />
      </div>

      {advanced && (
        <AdvancedPanel
          jsonText={jsonText}
          onJsonChange={setJsonText}
          onApply={applyJson}
          onImport={importFile}
          onExport={exportFile}
          onRequestReset={() => setConfirmReset(true)}
        />
      )}

      {confirmReset && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-bold">استعادة التصميم الافتراضي؟</h3>
            <p className="py-3 text-sm text-base-content/60">
              سيتم حذف التخصيص المحفوظ لهذا التقرير.
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-lg"
                onClick={() => setConfirmReset(false)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-error btn-lg"
                onClick={reset}
              >
                تأكيد الاستعادة
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDocument && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-bold">تغييرات غير محفوظة</h3>
            <p className="py-3 text-sm text-base-content/60">
              هل تريد تجاهلها والانتقال إلى تقرير آخر؟
            </p>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-lg"
                onClick={() => setPendingDocument(null)}
              >
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-warning btn-lg"
                onClick={confirmSwitch}
              >
                تبديل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
