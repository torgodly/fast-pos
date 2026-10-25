import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CashierShiftPanel } from "./CashierShiftPanel";
import { ShiftExpenseButton } from "./ShiftExpenseButton";
import type { ShiftListItem, ShiftTotals } from "@/lib/shifts/core";

const addShiftExpense = vi.fn();
const deleteShiftExpense = vi.fn();
const refresh = vi.fn();
const showToast = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/actions/shifts", () => ({
  addShiftExpense: (...args: unknown[]) => addShiftExpense(...args),
  deleteShiftExpense: (...args: unknown[]) => deleteShiftExpense(...args),
  openCashierShift: vi.fn(),
  printShiftSummary: vi.fn(),
  reprintShiftReport: vi.fn(),
  closeCashierShift: vi.fn(),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ showToast }),
}));

const totals: ShiftTotals = {
  invoiceCount: 2,
  totalSales: 100,
  cashTotal: 100,
  cardTotal: 0,
  totalItems: 4,
  tableSales: 0,
  quickSales: 2,
  groups: [],
  items: [],
  expenseTotal: 5,
};

const history: ShiftListItem[] = [
  {
    shiftId: 10,
    shiftNumber: 2,
    workDate: "2026-10-24",
    openedAt: "2026-10-24 09:00:00",
    closedAt: "2026-10-24 23:00:00",
    openedByName: "سارة",
    closedByName: "سارة",
    openingFloat: 30,
    expectedCash: 127.5,
    countedCash: 127.5,
    difference: 0,
    invoiceCount: 5,
    totalSales: 100,
    cashTotal: 100,
    cardTotal: 0,
    expenseTotal: 2.5,
  },
];

function renderPanel() {
  render(
    <CashierShiftPanel
      venueId="restaurant"
      venueLabel="المطعم"
      openShift={{
        shiftId: 11,
        shiftNumber: 3,
        openedAt: "2026-10-25 10:00:00",
        openingFloat: 30,
      }}
      totals={totals}
      expenses={[
        {
          id: 9,
          reason: "شراء ثلج",
          amount: 5,
          createdByName: "سارة",
          createdAt: "2026-10-25 11:00:00",
        },
      ]}
      history={history}
    />
  );
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  addShiftExpense.mockResolvedValue({ ok: true, message: "تم" });
  deleteShiftExpense.mockResolvedValue({ ok: true, message: "تم حذف المصروف" });
});

describe("CashierShiftPanel expenses", () => {
  it("subtracts shift expenses from the expected cash", () => {
    renderPanel();

    expect(screen.getAllByText("125.00 د.ل").length).toBeGreaterThan(0);
    expect(screen.getByText("شراء ثلج")).toBeInTheDocument();
    expect(screen.getByText("2.50 د.ل")).toBeInTheDocument();
  });

  it("deletes an expense after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel();

    fireEvent.click(screen.getByTitle("حذف المصروف"));

    await waitFor(() =>
      expect(deleteShiftExpense).toHaveBeenCalledWith("restaurant", 11, 9),
    );
    expect(showToast).toHaveBeenCalledWith("success", "تم حذف المصروف");
  });
});

describe("ShiftExpenseButton", () => {
  it("records an expense with an amount and reason", async () => {
    render(<ShiftExpenseButton venueId="restaurant" />);

    fireEvent.click(screen.getByRole("button", { name: "مصروف" }));
    fireEvent.change(screen.getByLabelText("المبلغ (د.ل)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("سبب المصروف"), {
      target: { value: "شراء ثلج" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل المصروف" }));

    await waitFor(() =>
      expect(addShiftExpense).toHaveBeenCalledWith("restaurant", 5, "شراء ثلج"),
    );
  });

  it("rejects a missing expense reason before calling the server", () => {
    render(<ShiftExpenseButton venueId="restaurant" />);

    fireEvent.click(screen.getByRole("button", { name: "مصروف" }));
    fireEvent.change(screen.getByLabelText("المبلغ (د.ل)"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "تسجيل المصروف" }));

    expect(addShiftExpense).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("error", "اكتب سبب المصروف");
  });
});
