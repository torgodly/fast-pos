export const DEFAULT_OPENING_FLOAT = 30;

export const MAX_EXPENSE_REASON_LENGTH = 120;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateShiftExpense(
  amount: number,
  reason: string,
): string | null {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "أدخل مبلغ مصروف أكبر من صفر";
  }
  const trimmed = reason.trim();
  if (!trimmed) return "اكتب سبب المصروف";
  if (trimmed.length > MAX_EXPENSE_REASON_LENGTH) {
    return "سبب المصروف طويل جداً";
  }
  return null;
}

export function calculateShiftCash(
  openingFloat: number,
  cashSales: number,
  cashExpenses: number,
  countedCash: number | null,
) {
  const expectedCash = roundMoney(openingFloat + cashSales - cashExpenses);
  const difference =
    countedCash === null ? null : roundMoney(countedCash - expectedCash);
  return { expectedCash, difference };
}
