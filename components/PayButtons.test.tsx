import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ToastProvider";
import type { PaymentMethodLike } from "@/lib/payments/core";
import { PayButtons } from "./PayButtons";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/orders", () => ({ payOrder: vi.fn() }));

const cash: PaymentMethodLike = {
  code: "cash",
  name: "نقدي",
  deferred: false,
  cashDrawer: true,
};
const card: PaymentMethodLike = {
  code: "card",
  name: "بطاقة",
  deferred: false,
  cashDrawer: false,
};
const phone: PaymentMethodLike = {
  code: "phone",
  name: "طلبات هاتف",
  deferred: true,
  cashDrawer: false,
};

function renderPay(methods: PaymentMethodLike[]) {
  const { container } = render(
    <ToastProvider>
      <PayButtons
        orderId={1}
        shiftOpen
        paymentMethods={methods}
        totalLabel="30.00 د.ل"
      />
    </ToastProvider>,
  );
  return container;
}

function visualOrder(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("button, [role='separator']"),
  ).map((node) =>
    node.getAttribute("role") === "separator" ? "|" : node.textContent?.trim(),
  );
}

describe("PayButtons", () => {
  it("separates the deferred hold button from the payment buttons", () => {
    const container = renderPay([cash, card, phone]);

    expect(
      container.querySelectorAll("[role='separator']"),
    ).toHaveLength(1);
    expect(visualOrder(container).slice(0, 4)).toEqual([
      "نقدي",
      "بطاقة",
      "|",
      "طلبات هاتف",
    ]);
  });

  it("adds no separator when every method collects money", () => {
    const container = renderPay([cash, card]);
    expect(container.querySelectorAll("[role='separator']")).toHaveLength(0);
  });

  it("renders the hold button alone without an empty payment row", () => {
    const container = renderPay([phone]);
    expect(container.querySelectorAll("[role='separator']")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "طلبات هاتف" })).toBeTruthy();
  });
});
