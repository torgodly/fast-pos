import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSystemPrinters, upsertPrinter } from "@/app/actions/admin";
import { ToastProvider } from "@/components/ToastProvider";
import { PrintersAdmin } from "./PrintersAdmin";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/actions/admin", () => ({
  deletePrinter: vi.fn(),
  getSystemPrinters: vi.fn(),
  setPrinterActive: vi.fn(),
  upsertPrinter: vi.fn(),
}));

const localPrinter = {
  id: 1,
  venueId: "restaurant" as const,
  name: "كاشير المطعم",
  role: "checkout",
  host: "default",
  port: 0,
  connectionType: "local",
  autoPrint: false,
  active: true,
};

const systemPrinters = [
  {
    name: "XP-80C",
    driver: "XP-80C",
    portName: "USB004",
    isDefault: true,
    host: null,
    port: null,
  },
  {
    name: "kitchen",
    driver: "XP-80C",
    portName: "kitchen",
    isDefault: false,
    host: "192.168.1.56",
    port: 9100,
  },
];

function renderPrinters(printers = [localPrinter]) {
  return render(
    <ToastProvider>
      <PrintersAdmin venueId="restaurant" printers={printers} />
    </ToastProvider>,
  );
}

async function openLocalPrinter(container: HTMLElement) {
  fireEvent.click(screen.getByTitle("تعديل"));
  return await waitFor(() => {
    const select = container.querySelector(
      'select[name="host"]',
    ) as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(
      container.querySelector('option[value="XP-80C"]'),
    ).toBeTruthy();
    return select as HTMLSelectElement;
  });
}

describe("PrintersAdmin auto print", () => {
  beforeEach(() => {
    vi.mocked(upsertPrinter).mockReset();
    vi.mocked(upsertPrinter).mockResolvedValue({ ok: true });
    vi.mocked(getSystemPrinters).mockReset();
    vi.mocked(getSystemPrinters).mockResolvedValue({
      printers: systemPrinters,
    });
  });

  it("shows the auto print checkbox checked for a local auto-print printer", async () => {
    const { container } = renderPrinters([
      { ...localPrinter, autoPrint: true },
    ]);

    await openLocalPrinter(container);

    const checkbox = container.querySelector(
      'input[name="autoPrint"]',
    ) as HTMLInputElement | null;
    expect(checkbox).toBeChecked();
    expect(
      screen.getByText("طباعة تلقائية بدون نافذة Chrome"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/اختر طابعة Windows محددة/),
    ).toBeInTheDocument();
  });

  it("submits the selected Windows queue when auto print is enabled", async () => {
    const { container } = renderPrinters();

    const select = await openLocalPrinter(container);
    fireEvent.change(select, { target: { value: "XP-80C" } });
    const checkbox = container.querySelector(
      'input[name="autoPrint"]',
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("حفظ التعديلات"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("autoPrint")).toBe("on");
    expect(formData.get("host")).toBe("XP-80C");
  });

  it("blocks auto print until an explicit Windows queue is chosen", async () => {
    const { container } = renderPrinters();

    await openLocalPrinter(container);
    const checkbox = container.querySelector(
      'input[name="autoPrint"]',
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("حفظ التعديلات"));

    expect(
      screen.getByText(/اختر طابعة Windows محددة/),
    ).toBeInTheDocument();
    expect(upsertPrinter).not.toHaveBeenCalled();
  });

  it("lists the installed Windows printers in the local printer modal", async () => {
    const { container } = renderPrinters();

    const select = await openLocalPrinter(container);
    const values = Array.from(select.options).map((option) => option.value);

    expect(values).toContain("XP-80C");
    expect(values).toContain("kitchen");
  });

  it("hides auto print for a network printer", async () => {
    const { container } = renderPrinters([
      {
        ...localPrinter,
        host: "192.168.1.50",
        port: 9100,
        connectionType: "network",
        autoPrint: true,
      },
    ]);

    fireEvent.click(screen.getByTitle("تعديل"));

    expect(container.querySelector('input[name="autoPrint"]')).toBeNull();
  });
});
