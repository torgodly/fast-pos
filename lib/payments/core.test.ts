import { describe, expect, it } from "vitest";
import {
  buildPaymentBreakdown,
  generatePaymentMethodCode,
  paymentMethodLabel,
  resolvePaymentMethodFlags,
  validatePaymentMethodName,
  type PaymentMethodLike,
} from "./core";

const methods: PaymentMethodLike[] = [
  { code: "cash", name: "نقدي", deferred: false, cashDrawer: true },
  { code: "card", name: "بطاقة", deferred: false, cashDrawer: false },
  { code: "presto", name: "بريستو", deferred: true, cashDrawer: false },
];

describe("payment method labels", () => {
  it("uses the configured name for a code", () => {
    expect(paymentMethodLabel("presto", methods)).toBe("بريستو");
  });

  it("keeps legacy cash and card labels when no row exists", () => {
    expect(paymentMethodLabel("cash", [])).toBe("نقدي");
    expect(paymentMethodLabel("card", [])).toBe("بطاقة");
  });

  it("labels the predefined phone method without a database row", () => {
    expect(paymentMethodLabel("phone", [])).toBe("طلبات هاتف");
  });

  it("falls back to the raw code for an unknown method", () => {
    expect(paymentMethodLabel("bank_transfer", methods)).toBe("bank_transfer");
    expect(paymentMethodLabel(null, methods)).toBe("غير محدد");
  });
});

describe("payment breakdown", () => {
  it("aggregates per method and separates cash-drawer totals", () => {
    const result = buildPaymentBreakdown(
      [
        { paymentMethod: "cash", total: 20 },
        { paymentMethod: "cash", total: 5.5 },
        { paymentMethod: "card", total: 10 },
        { paymentMethod: "presto", total: 7 },
      ],
      methods,
    );

    expect(result.cashTotal).toBe(25.5);
    expect(result.nonCashTotal).toBe(17);
    expect(result.breakdown).toEqual([
      {
        code: "cash",
        name: "نقدي",
        total: 25.5,
        count: 2,
        cashDrawer: true,
        deferred: false,
      },
      {
        code: "card",
        name: "بطاقة",
        total: 10,
        count: 1,
        cashDrawer: false,
        deferred: false,
      },
      {
        code: "presto",
        name: "بريستو",
        total: 7,
        count: 1,
        cashDrawer: false,
        deferred: true,
      },
    ]);
  });

  it("keeps legacy and unknown codes visible instead of dropping them", () => {
    const result = buildPaymentBreakdown(
      [
        { paymentMethod: "cash", total: 10 },
        { paymentMethod: "card", total: 4 },
        { paymentMethod: "old_method", total: 3 },
        { paymentMethod: null, total: 2 },
      ],
      [],
    );

    expect(result.breakdown.map((row) => row.code)).toEqual([
      "cash",
      "card",
      "old_method",
      null,
    ]);
    expect(result.breakdown[3]?.name).toBe("غير محدد");
    expect(result.cashTotal).toBe(10);
  });

  it("uses the cash-drawer flag rather than a hardcoded code", () => {
    const customCash = [
      ...methods,
      {
        code: "drawer2",
        name: "درج ثانٍ",
        deferred: false,
        cashDrawer: true,
      },
    ];
    const result = buildPaymentBreakdown(
      [{ paymentMethod: "drawer2", total: 9 }],
      customCash,
    );

    expect(result.cashTotal).toBe(9);
    expect(result.nonCashTotal).toBe(0);
  });
});

describe("payment method validation", () => {
  it("rejects empty and overly long names", () => {
    expect(validatePaymentMethodName("   ")).toBe("اسم طريقة الدفع مطلوب");
    expect(validatePaymentMethodName("ن".repeat(41))).toBe(
      "اسم طريقة الدفع طويل جداً",
    );
    expect(validatePaymentMethodName("بريستو")).toBeNull();
  });

  it("does not allow a deferred method to count as drawer cash", () => {
    expect(
      resolvePaymentMethodFlags({
        builtIn: false,
        currentDeferred: true,
        currentCashDrawer: false,
        submittedCashDrawer: true,
      }),
    ).toEqual({ deferred: true, cashDrawer: false });
  });

  it("keeps predefined method flags fixed", () => {
    expect(
      resolvePaymentMethodFlags({
        builtIn: true,
        currentDeferred: true,
        currentCashDrawer: false,
        submittedCashDrawer: true,
      }),
    ).toEqual({ deferred: true, cashDrawer: false });
    expect(
      resolvePaymentMethodFlags({
        builtIn: true,
        currentDeferred: false,
        currentCashDrawer: true,
        submittedCashDrawer: false,
      }),
    ).toEqual({ deferred: false, cashDrawer: true });
  });

  it("lets custom methods follow the submitted cash-expectation choice", () => {
    expect(
      resolvePaymentMethodFlags({
        builtIn: false,
        currentDeferred: false,
        currentCashDrawer: false,
        submittedCashDrawer: true,
      }),
    ).toEqual({ deferred: false, cashDrawer: true });
    expect(
      resolvePaymentMethodFlags({
        builtIn: false,
        currentDeferred: false,
        currentCashDrawer: true,
        submittedCashDrawer: false,
      }),
    ).toEqual({ deferred: false, cashDrawer: false });
  });

  it("generates stable, unique method codes", () => {
    const first = generatePaymentMethodCode();
    const second = generatePaymentMethodCode();

    expect(first).toMatch(/^pm_[0-9a-f]{12}$/);
    expect(second).toMatch(/^pm_[0-9a-f]{12}$/);
    expect(first).not.toBe(second);
  });
});
