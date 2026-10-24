import ExcelJS from "exceljs";
import { MENU_EXCEL_HEADERS, MENU_EXCEL_SHEET_NAME } from "./excel-format";

const VALIDATION_ROWS = 500;

function applyListValidation(
  sheet: ExcelJS.Worksheet,
  column: string,
  values: string[],
) {
  const formulae = [`"${values.join(",")}"`];
  for (let row = 2; row <= VALIDATION_ROWS; row += 1) {
    sheet.getCell(`${column}${row}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae,
      showErrorMessage: true,
      errorTitle: "قيمة غير صالحة",
      error: "اختر قيمة من القائمة المنسدلة",
    };
  }
}

export function buildMenuTemplateWorkbook({
  counterMode,
}: {
  counterMode: boolean;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "فاست بوس";
  const sheet = workbook.addWorksheet(MENU_EXCEL_SHEET_NAME, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: MENU_EXCEL_HEADERS[0], key: "category", width: 22 },
    { header: MENU_EXCEL_HEADERS[1], key: "scope", width: 14 },
    { header: MENU_EXCEL_HEADERS[2], key: "sort", width: 14 },
    { header: MENU_EXCEL_HEADERS[3], key: "catActive", width: 14 },
    { header: MENU_EXCEL_HEADERS[4], key: "item", width: 28 },
    { header: MENU_EXCEL_HEADERS[5], key: "price", width: 12 },
    { header: MENU_EXCEL_HEADERS[6], key: "itemActive", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  applyListValidation(
    sheet,
    "B",
    counterMode ? ["مطعم"] : ["مطعم", "كافيه", "مشترك"],
  );
  applyListValidation(sheet, "D", ["نعم", "لا"]);
  applyListValidation(sheet, "G", ["نعم", "لا"]);

  return workbook;
}
