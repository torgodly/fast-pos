import {
  getBrandDetails,
  getReceiptFooterMessage,
} from "@/lib/settings";
import type {
  CheckoutReceiptData,
  KitchenReceiptData,
  ReportSummaryPrintData,
  ShiftItemsPrintData,
  ShiftReportPrintData,
} from "../receipts";
import { getReceiptLogoEscPos, readReceiptLogoPng } from "../logo";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import { DEFAULT_LOGO_WIDTH, logoElement } from "./elements";
import { layoutTemplate } from "./layout";
import { renderLayout } from "./render";
import { buildSampleDocuments } from "./sample";
import { loadReportTemplate } from "./store";
import type {
  DocumentData,
  LayoutLine,
  ReportDocument,
  ReportTemplate,
} from "./types";

export type BuildOverrides = {
  template?: ReportTemplate;
  logo?: Uint8Array | null;
  settings?: Partial<ReceiptDocumentSettings>;
};

export type SampleBuildOptions = {
  logo?: Uint8Array | null;
  settings?: Partial<ReceiptDocumentSettings>;
};

function storedSettings(): Omit<ReceiptDocumentSettings, "venueName"> {
  const brand = getBrandDetails();
  return {
    brandName: brand.name,
    brandPhone: brand.phone,
    brandAddress: brand.address,
    footer: getReceiptFooterMessage(),
    logoAvailable: true,
  };
}

function resolveSettings(
  venueName: string,
  overrides?: Partial<ReceiptDocumentSettings>,
): ReceiptDocumentSettings {
  const base: Omit<ReceiptDocumentSettings, "venueName"> = overrides
    ? {
        brandName: "",
        brandPhone: "",
        brandAddress: "",
        footer: "",
        logoAvailable: false,
      }
    : storedSettings();
  return {
    ...base,
    ...(overrides ?? {}),
    venueName,
  };
}

export type DocumentPage = {
  lines: LayoutLine[];
  logoPng: Uint8Array | null;
};

/**
 * The same lines the printer receives, plus the logo as PNG for the PDF page
 * renderer. Thermal output still goes through `renderDocument` above.
 */
export async function documentPage(
  document: ReportDocument,
  data: DocumentData,
  overrides: Pick<BuildOverrides, "template"> = {},
): Promise<DocumentPage> {
  const template = overrides.template ?? loadReportTemplate(document);
  const logo = logoElement(template);
  const logoPng =
    logo?.visible && data.logoAvailable ? readReceiptLogoPng() : null;
  return { lines: layoutTemplate(template, data), logoPng };
}

async function renderDocument(
  document: ReportDocument,
  data: DocumentData,
  overrides: BuildOverrides,
): Promise<Uint8Array> {
  const template = overrides.template ?? loadReportTemplate(document);
  let logoBytes: Uint8Array | null = null;

  const logo = logoElement(template);
  if (overrides.logo !== undefined) {
    logoBytes = overrides.logo;
  } else if (logo?.visible && data.logoAvailable) {
    logoBytes = await getReceiptLogoEscPos(
      logo.maxWidth ?? DEFAULT_LOGO_WIDTH,
    );
  }

  return renderLayout(layoutTemplate(template, data), { logo: logoBytes });
}

export async function buildReceiptEscPos(
  data: CheckoutReceiptData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  const settings = resolveSettings(data.venueName, overrides.settings);
  return renderDocument(
    "receipt",
    receiptDocumentData(data, settings),
    overrides,
  );
}

export async function buildKitchenEscPos(
  data: KitchenReceiptData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("kitchen", kitchenDocumentData(data), overrides);
}

export async function buildShiftReportEscPos(
  data: ShiftReportPrintData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("shift", shiftDocumentData(data), overrides);
}

export async function buildShiftItemsEscPos(
  data: ShiftItemsPrintData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("items", itemsDocumentData(data), overrides);
}

export async function buildSalesReportEscPos(
  data: ReportSummaryPrintData,
  overrides: BuildOverrides = {},
): Promise<Uint8Array> {
  return renderDocument("sales", salesDocumentData(data), overrides);
}

export async function receiptPage(
  data: CheckoutReceiptData,
  overrides: BuildOverrides = {},
): Promise<DocumentPage> {
  const settings = resolveSettings(data.venueName, overrides.settings);
  return documentPage("receipt", receiptDocumentData(data, settings), overrides);
}

export async function kitchenPage(
  data: KitchenReceiptData,
  overrides: BuildOverrides = {},
): Promise<DocumentPage> {
  return documentPage("kitchen", kitchenDocumentData(data), overrides);
}

export async function shiftPage(
  data: ShiftReportPrintData,
  overrides: BuildOverrides = {},
): Promise<DocumentPage> {
  return documentPage("shift", shiftDocumentData(data), overrides);
}

export async function itemsPage(
  data: ShiftItemsPrintData,
  overrides: BuildOverrides = {},
): Promise<DocumentPage> {
  return documentPage("items", itemsDocumentData(data), overrides);
}

export async function salesPage(
  data: ReportSummaryPrintData,
  overrides: BuildOverrides = {},
): Promise<DocumentPage> {
  return documentPage("sales", salesDocumentData(data), overrides);
}

export async function samplePage(
  document: ReportDocument,
  template: ReportTemplate,
  options: SampleBuildOptions = {},
): Promise<DocumentPage> {
  const settings = resolveSettings("فاست بوس", options.settings);
  const data = buildSampleDocuments(settings)[document];
  return documentPage(document, data, { template });
}

export async function buildSampleEscPos(
  document: ReportDocument,
  template: ReportTemplate,
  options: SampleBuildOptions = {},
): Promise<Uint8Array> {
  const settings = resolveSettings("فاست بوس", options.settings);
  const data = buildSampleDocuments(settings)[document];

  let logoBytes: Uint8Array | null = null;
  const logo = logoElement(template);
  if (options.logo !== undefined) {
    logoBytes = options.logo;
  } else if (logo?.visible && data.logoAvailable) {
    logoBytes = await getReceiptLogoEscPos(
      logo.maxWidth ?? DEFAULT_LOGO_WIDTH,
    );
  }

  return renderLayout(layoutTemplate(template, data), { logo: logoBytes });
}
