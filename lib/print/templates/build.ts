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
import { getReceiptLogoEscPos } from "../logo";
import {
  itemsDocumentData,
  kitchenDocumentData,
  receiptDocumentData,
  salesDocumentData,
  shiftDocumentData,
  type ReceiptDocumentSettings,
} from "./data";
import { layoutTemplate } from "./layout";
import { renderLayout } from "./render";
import { buildSampleDocuments } from "./sample";
import { loadReportTemplate } from "./store";
import type {
  DocumentData,
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

async function renderDocument(
  document: ReportDocument,
  data: DocumentData,
  overrides: BuildOverrides,
): Promise<Uint8Array> {
  const template = overrides.template ?? loadReportTemplate(document);
  let logo: Uint8Array | null = null;

  if (overrides.logo !== undefined) {
    logo = overrides.logo;
  } else if (template.header.logo.show && data.logoAvailable) {
    logo = await getReceiptLogoEscPos(template.header.logo.maxWidth ?? 256);
  }

  return renderLayout(layoutTemplate(template, data), { logo });
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

export async function buildSampleEscPos(
  document: ReportDocument,
  template: ReportTemplate,
  options: SampleBuildOptions = {},
): Promise<Uint8Array> {
  const settings = resolveSettings("فاست بوس", options.settings);
  const data = buildSampleDocuments(settings)[document];

  let logo: Uint8Array | null = null;
  if (options.logo !== undefined) {
    logo = options.logo;
  } else if (template.header.logo.show && data.logoAvailable) {
    logo = await getReceiptLogoEscPos(template.header.logo.maxWidth ?? 256);
  }

  return renderLayout(layoutTemplate(template, data), { logo });
}
