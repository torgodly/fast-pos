export type PaymentMethodLike = {
  code: string;
  name: string;
  deferred: boolean;
  cashDrawer: boolean;
};

export type PaymentBreakdownItem = Omit<PaymentMethodLike, "code"> & {
  code: string | null;
  total: number;
  count: number;
};

export type PaymentTotals = {
  breakdown: PaymentBreakdownItem[];
  cashTotal: number;
  nonCashTotal: number;
};

export const UNKNOWN_PAYMENT_METHOD_NAME = "غير محدد";

const LEGACY_METHODS: Record<string, PaymentMethodLike> = {
  cash: { code: "cash", name: "نقدي", deferred: false, cashDrawer: true },
  card: { code: "card", name: "بطاقة", deferred: false, cashDrawer: false },
  phone: {
    code: "phone",
    name: "طلبات هاتف",
    deferred: true,
    cashDrawer: false,
  },
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function paymentMethodLabel(
  code: string | null | undefined,
  methods: PaymentMethodLike[],
): string {
  if (!code?.trim()) return UNKNOWN_PAYMENT_METHOD_NAME;
  const configured = methods.find((method) => method.code === code);
  if (configured) return configured.name;
  return LEGACY_METHODS[code]?.name ?? code;
}

export function buildPaymentBreakdown(
  rows: Array<{ paymentMethod: string | null; total: number }>,
  methods: PaymentMethodLike[],
): PaymentTotals {
  const definitions = new Map(methods.map((method) => [method.code, method]));
  const items = new Map<string | null, PaymentBreakdownItem>();
  const order: Array<string | null> = methods.map((method) => method.code);

  for (const row of rows) {
    const code = row.paymentMethod?.trim() ? row.paymentMethod : null;
    let item = items.get(code);
    if (!item) {
      const definition = code
        ? (definitions.get(code) ?? LEGACY_METHODS[code])
        : null;
      item = {
        code,
        name: code
          ? (definition?.name ?? code)
          : UNKNOWN_PAYMENT_METHOD_NAME,
        deferred: definition?.deferred ?? false,
        cashDrawer: definition?.cashDrawer ?? code === "cash",
        total: 0,
        count: 0,
      };
      items.set(code, item);
      if (!order.includes(code)) order.push(code);
    }
    item.total += row.total;
    item.count += 1;
  }

  const breakdown = order
    .filter((code) => items.has(code))
    .map((code) => {
      const item = items.get(code)!;
      return { ...item, total: roundMoney(item.total) };
    });

  const cashTotal = roundMoney(
    breakdown
      .filter((item) => item.cashDrawer)
      .reduce((sum, item) => sum + item.total, 0),
  );
  const nonCashTotal = roundMoney(
    breakdown
      .filter((item) => !item.cashDrawer)
      .reduce((sum, item) => sum + item.total, 0),
  );

  return { breakdown, cashTotal, nonCashTotal };
}

export function validatePaymentMethodName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "اسم طريقة الدفع مطلوب";
  if (trimmed.length > 40) return "اسم طريقة الدفع طويل جداً";
  return null;
}

export function resolvePaymentMethodFlags(input: {
  builtIn: boolean;
  currentDeferred: boolean;
  currentCashDrawer: boolean;
  submittedCashDrawer: boolean;
}): { deferred: boolean; cashDrawer: boolean } {
  if (input.builtIn) {
    return {
      deferred: input.currentDeferred,
      cashDrawer: input.currentCashDrawer,
    };
  }
  if (input.currentDeferred) {
    return { deferred: true, cashDrawer: false };
  }
  return { deferred: false, cashDrawer: input.submittedCashDrawer };
}

export function generatePaymentMethodCode(): string {
  const uuid = globalThis.crypto.randomUUID().replaceAll("-", "");
  return `pm_${uuid.slice(0, 12)}`;
}
