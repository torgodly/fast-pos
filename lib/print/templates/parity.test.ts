import { describe, expect, it } from "vitest";
import { DEFAULT_REPORT_TEMPLATES_V1 } from "./defaults-v1";
import { DEFAULT_REPORT_TEMPLATES_V2 } from "./defaults-v2";
import { layoutTemplateV1 } from "./layout-v1";
import { layoutTemplateV2 } from "./layout-v2";
import { migrateReportTemplate } from "./migrate";
import { renderLayout } from "./render";
import { buildSampleDocuments, sampleSettings } from "./sample";
import { parseReportTemplateJson } from "./schema";
import {
  REPORT_DOCUMENTS,
  type ReportDocument,
  type ReportTemplateV1,
  type ReportTemplateV2,
} from "./types";

const samples = buildSampleDocuments(sampleSettings);
const logo = new Uint8Array([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0, 0x80]);

// A two-byte floor would let two empty streams pass as parity, so every
// comparison also asserts the stream carries real ESC/POS payload.
const MINIMUM_BYTES = 1000;

const logoVariants: Array<{ label: string; raster: Uint8Array | null }> = [
  { label: "with logo", raster: logo },
  { label: "without logo", raster: null },
];

function expectParity(
  templateV1: ReportTemplateV1,
  templateV2: ReportTemplateV2,
  document: ReportDocument,
  raster: Uint8Array | null,
  minimumBytes = MINIMUM_BYTES,
) {
  const v1Bytes = renderLayout(layoutTemplateV1(templateV1, samples[document]), {
    logo: raster,
  });
  const v2Bytes = renderLayout(layoutTemplateV2(templateV2, samples[document]), {
    logo: raster,
  });
  expect(v1Bytes.length).toBeGreaterThan(minimumBytes);
  expect(v2Bytes.length).toBe(v1Bytes.length);
  expect(Buffer.from(v2Bytes).equals(Buffer.from(v1Bytes))).toBe(true);
}

type StoredVariant = {
  name: string;
  document: ReportDocument;
  mutate: (template: ReportTemplateV1) => void;
  minimumBytes?: number;
};

function storedFixture(variant: StoredVariant): ReportTemplateV1 {
  const fixture = structuredClone(DEFAULT_REPORT_TEMPLATES_V1[variant.document]);
  variant.mutate(fixture);
  return fixture;
}

// The stored-variant shapes from design spec §9: a saved v1 design that differs
// from the defaults must migrate to the same bytes it printed before.
const storedVariants: StoredVariant[] = [
  {
    name: "hidden header and fields",
    document: "receipt",
    mutate: (template) => {
      template.header.show = false;
      template.fields.visible = false;
    },
  },
  {
    name: "empty footer",
    document: "receipt",
    mutate: (template) => {
      template.footer.lines = [];
      template.footer.show = true;
    },
  },
  {
    name: "sections off",
    document: "shift",
    mutate: (template) => {
      template.sections.forEach((section) => {
        section.show = false;
      });
    },
  },
  {
    name: "summary separator off",
    document: "items",
    mutate: (template) => {
      template.summary.separator = false;
    },
  },
  {
    name: "reversed fields",
    document: "receipt",
    mutate: (template) => {
      template.fields.show.reverse();
    },
  },
  {
    name: "custom labels",
    document: "receipt",
    mutate: (template) => {
      template.labels.waiter = "النادل";
      template.labels.customer = "اسم العميل";
    },
  },
];

describe("v2 default parity", () => {
  describe.each(logoVariants)("$label", ({ raster }) => {
    it.each(REPORT_DOCUMENTS)("matches the v1 bytes for %s", (document: ReportDocument) => {
      expectParity(
        DEFAULT_REPORT_TEMPLATES_V1[document],
        DEFAULT_REPORT_TEMPLATES_V2[document],
        document,
        raster,
      );
    });
  });
});

describe("v2 stored-variant parity", () => {
  it.each(storedVariants)("migrates $name deterministically", (variant) => {
    const fixture = storedFixture(variant);
    expect(migrateReportTemplate(fixture)).toEqual(
      migrateReportTemplate(structuredClone(fixture)),
    );
  });

  describe.each(logoVariants)("$label", ({ raster }) => {
    it.each(storedVariants)("matches the v1 bytes for $name", (variant) => {
      const fixture = storedFixture(variant);
      expectParity(
        fixture,
        migrateReportTemplate(fixture),
        variant.document,
        raster,
        variant.minimumBytes,
      );
    });
  });

  // A stored `.fprep` never reaches the print path as a plain object: it is
  // parsed and migrated first. Run each stored shape through that real path so
  // validation or normalization cannot silently change the printed bytes.
  it.each(storedVariants)(
    "matches the v1 bytes after the JSON parse path for $name",
    (variant) => {
      const fixture = storedFixture(variant);
      const parsed = parseReportTemplateJson(
        JSON.stringify(fixture),
        variant.document,
      );
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      for (const { raster } of logoVariants) {
        expectParity(
          fixture,
          parsed.template,
          variant.document,
          raster,
          variant.minimumBytes,
        );
      }
    },
  );
});
