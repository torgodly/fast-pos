import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildMenuTemplateWorkbook } from "./excel-template";

const HEADERS = [
  "التصنيف",
  "النطاق",
  "ترتيب التصنيف",
  "التصنيف نشط",
  "الصنف",
  "السعر",
  "الصنف نشط",
];

function headerValues(sheet: ExcelJS.Worksheet) {
  return HEADERS.map((_, index) => sheet.getRow(1).getCell(index + 1).value);
}

describe("menu import template", () => {
  it("uses the importer headers and offers venue and active dropdowns", () => {
    const sheet = buildMenuTemplateWorkbook({ counterMode: false })
      .worksheets[0]!;

    expect(sheet.name).toBe("القائمة");
    expect(sheet.views[0]).toMatchObject({
      rightToLeft: true,
      state: "frozen",
      ySplit: 1,
    });
    expect(headerValues(sheet)).toEqual(HEADERS);
    expect(sheet.getRow(1).font.bold).toBe(true);

    expect(sheet.getCell("B2").dataValidation.formulae).toEqual([
      '"مطعم,كافيه,مشترك"',
    ]);
    expect(sheet.getCell("D2").dataValidation.formulae).toEqual(['"نعم,لا"']);
    expect(sheet.getCell("G2").dataValidation.formulae).toEqual(['"نعم,لا"']);
    expect(sheet.actualRowCount).toBe(1);
  });

  it("counter mode only allows the restaurant scope", () => {
    const sheet = buildMenuTemplateWorkbook({ counterMode: true })
      .worksheets[0]!;

    expect(sheet.getCell("B2").dataValidation.formulae).toEqual(['"مطعم"']);
  });

  it("round-trips as a readable xlsx file", async () => {
    const buffer = await buildMenuTemplateWorkbook({
      counterMode: false,
    }).xlsx.writeBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;

    expect(sheet.name).toBe("القائمة");
    expect(headerValues(sheet)).toEqual(HEADERS);
    expect(sheet.getCell("B2").dataValidation.formulae).toEqual([
      '"مطعم,كافيه,مشترك"',
    ]);
  });
});
