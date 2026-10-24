import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ToastProvider";
import { ItemsAdmin } from "./ItemsAdmin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/admin", () => ({
  deleteCategory: vi.fn(),
  deleteItem: vi.fn(),
  deleteItems: vi.fn(),
  moveItemsToCategory: vi.fn(),
  setCategoryActive: vi.fn(),
  setItemActive: vi.fn(),
  setItemsActive: vi.fn(),
  upsertCategory: vi.fn(),
  upsertItem: vi.fn(),
}));

const category = {
  id: 1,
  name: "قهوة",
  sortOrder: 1,
  kitchenPrinterId: null,
  restaurantKitchenPrinterId: null,
  cafeKitchenPrinterId: null,
  active: true,
  venueId: "restaurant",
};

const units = [
  { id: 1, name: "غرام", kind: "weight" as const, factorToBase: 1, active: true },
  { id: 2, name: "كيلو", kind: "weight" as const, factorToBase: 1000, active: true },
  { id: 3, name: "حبة", kind: "count" as const, factorToBase: 1, active: true },
];

function renderAdmin(counterMode: boolean, categories = [category]) {
  return render(
    <ToastProvider>
      <ItemsAdmin
        venueId="restaurant"
        categories={categories}
        items={[]}
        kitchenPrinters={[]}
        allKitchenPrinters={[]}
        ingredients={[]}
        units={units}
        bomByItem={[]}
        counterMode={counterMode}
      />
    </ToastProvider>,
  );
}

describe("ItemsAdmin counter mode", () => {
  it("hides venue scope choices in the category modal and submits restaurant", () => {
    const { container } = renderAdmin(true, []);
    fireEvent.click(screen.getByRole("button", { name: /تصنيف جديد/ }));

    expect(
      screen.queryByText("أين يظهر هذا التصنيف؟"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("مطعم فقط")).not.toBeInTheDocument();
    expect(screen.queryByText("كافيه فقط")).not.toBeInTheDocument();
    expect(screen.queryByText("مشترك")).not.toBeInTheDocument();

    expect(container.querySelector('input[name="venueScope"]')).toHaveValue(
      "restaurant",
    );
  });

  it("hides the venue scope line in the item modal", () => {
    renderAdmin(true);
    fireEvent.click(screen.getByRole("button", { name: /أضف أول صنف/ }));

    expect(screen.queryByText(/النطاق:/)).not.toBeInTheDocument();
  });

  it("keeps venue scope choices outside counter mode", () => {
    renderAdmin(false, []);
    fireEvent.click(screen.getByRole("button", { name: /تصنيف جديد/ }));

    expect(screen.getByText("أين يظهر هذا التصنيف؟")).toBeInTheDocument();
    expect(screen.getByText("كافيه فقط")).toBeInTheDocument();
    expect(screen.getAllByText("مشترك").length).toBeGreaterThan(0);
  });
});
