import { asc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { requireAdmin } from "@/app/actions/auth";
import { ReportDesignAdmin } from "@/components/admin/report-design/ReportDesignAdmin";
import { db } from "@/lib/db";
import { printers } from "@/lib/db/schema";
import { templatesEqual } from "@/lib/print/templates/schema";
import { buildSampleDocuments } from "@/lib/print/templates/sample";
import { getReportTemplateJson, loadReportTemplate } from "@/lib/print/templates/store";
import {
  DEFAULT_REPORT_TEMPLATES,
} from "@/lib/print/templates/defaults";
import {
  isReportDocument,
  REPORT_DOCUMENTS,
  type ReportDocument,
} from "@/lib/print/templates/types";
import { getBrandDetails, getReceiptFooterMessage } from "@/lib/settings";

export default async function ReportDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const document: ReportDocument = isReportDocument(params.doc)
    ? params.doc
    : "receipt";

  const brand = getBrandDetails();
  const settings = {
    venueName: "فاست بوس",
    brandName: brand.name,
    brandPhone: brand.phone,
    brandAddress: brand.address,
    footer: getReceiptFooterMessage(),
    logoAvailable: true,
  };
  const sample = buildSampleDocuments(settings)[document];
  const template = loadReportTemplate(document);
  const isDefault = templatesEqual(
    template,
    DEFAULT_REPORT_TEMPLATES[document],
  );

  const rows = db
    .select()
    .from(printers)
    .where(eq(printers.active, true))
    .orderBy(asc(printers.name), asc(printers.id))
    .all();

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="size-6" />
        </span>
        <div>
          <h2 className="text-2xl font-black sm:text-3xl">تصميم التقارير</h2>
          <p className="text-sm text-base-content/45">
            خصّص الإيصالات والتقارير المطبوعة دون تغيير الكود
          </p>
        </div>
      </div>

      <ReportDesignAdmin
        key={document}
        document={document}
        documents={[...REPORT_DOCUMENTS]}
        template={template}
        templateJson={getReportTemplateJson(document)}
        isDefault={isDefault}
        sample={sample}
        printers={rows.map((row) => ({
          id: row.id,
          name: row.name,
          connectionType: row.connectionType,
        }))}
      />
    </div>
  );
}
