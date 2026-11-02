import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ToastProvider";
import type { PaymentMethodLike } from "@/lib/payments/core";
import { QuickSaleBoard } from "./QuickSaleBoard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/actions/orders", () => ({
  payQuickSale: vi.fn(),
  printQuickSalePreview: vi.fn(),
  printOpenOrderReceipt: vi.fn(),
}));
vi.mock("@/app/actions/customers", () => ({ quickCreateCustomer: vi.fn() }));

const methods: PaymentMethodLike[] = [
  { code: "cash", name: "نقدي", deferred: false, cashDrawer: true },
  { code: "card", name: "بطاقة", deferred: false, cashDrawer: false },
  { code: "phone", name: "طلبات هاتف", deferred: true, cashDrawer: false },
];

function renderBoard(paymentMethods: PaymentMethodLike[] = methods) {
  const { container } = render(
    <ToastProvider>
      <QuickSaleBoard
        venueId="restaurant"
        categories={[]}
        items={[]}
        customers={[]}
        paymentMethods={paymentMethods}
      />
    </ToastProvider>,
  );
  return container;
}

function visualOrder(container: HTMLElement) {
  const paymentLabels = new Set(["نقدي", "بطاقة", "طلبات هاتف"]);
  return Array.from(
    container.querySelectorAll<HTMLElement>("button, [role='separator']"),
  )
    .map((node) =>
      node.getAttribute("role") === "separator" ? "|" : node.textContent?.trim(),
    )
    .filter((text) => text === "|" || paymentLabels.has(text ?? ""));
}

describe("QuickSaleBoard", () => {
  it("separates the deferred hold button from the payment buttons", () => {
    const container = renderBoard();

    expect(container.querySelectorAll("[role='separator']")).toHaveLength(1);
    expect(visualOrder(container)).toEqual([
      "نقدي",
      "بطاقة",
      "|",
      "طلبات هاتف",
    ]);
  });

  it("adds no deferred separator when every method collects money", () => {
    const container = renderBoard(methods.filter((method) => !method.deferred));
    expect(container.querySelectorAll("[role='separator']")).toHaveLength(0);
    expect(visualOrder(container)).toEqual(["نقدي", "بطاقة"]);
  });

  it("drops the invoice preview from the ticket", () => {
    renderBoard();

    expect(screen.queryByRole("button", { name: "فاتورة" })).toBeNull();
  });

  it("moves the customer into the cart header", () => {
    const container = renderBoard();

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(
      within(header as HTMLElement).getByRole("button", { name: /بدون عميل/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "نقدي" }).closest("header"),
    ).toBeNull();
  });
});
