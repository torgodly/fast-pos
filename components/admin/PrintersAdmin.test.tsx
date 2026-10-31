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

const systemPrinter = {
  id: 1,
  venueId: "restaurant" as const,
  name: "كاشير المطعم",
  role: "checkout",
  host: "XP-80C",
  port: 0,
  connectionType: "local",
  active: true,
};

const legacyLocalPrinter = {
  ...systemPrinter,
  host: "default",
};

const networkPrinter = {
  id: 2,
  venueId: null,
  name: "مطبخ",
  role: "kitchen",
  host: "192.168.1.56",
  port: 9100,
  connectionType: "network",
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

function renderPrinters(printers = [systemPrinter]) {
  return render(
    <ToastProvider>
      <PrintersAdmin venueId="restaurant" printers={printers} />
    </ToastProvider>,
  );
}

async function openEdit(container: HTMLElement) {
  fireEvent.click(screen.getByTitle("تعديل"));
  return await waitFor(() => {
    const select = container.querySelector(
      'select[name="host"]',
    ) as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    // getSystemPrinters() resolves asynchronously; wait for the options so
    // fireEvent.change on a known queue cannot race the empty list.
    expect(
      select!.querySelector('option[value="XP-80C"]'),
    ).toBeTruthy();
    return select as HTMLSelectElement;
  });
}

beforeEach(() => {
  vi.mocked(upsertPrinter).mockReset();
  vi.mocked(upsertPrinter).mockResolvedValue({ ok: true });
  vi.mocked(getSystemPrinters).mockReset();
  vi.mocked(getSystemPrinters).mockResolvedValue({
    printers: systemPrinters,
  });
});

describe("PrintersAdmin connection types", () => {
  it("uses only the two connection types and never mentions Chrome or auto print", async () => {
    const { container } = renderPrinters();

    await openEdit(container);

    const connection = container.querySelector(
      'select[name="connectionType"]',
    ) as HTMLSelectElement;
    expect(
      Array.from(connection.options).map((option) => option.value),
    ).toEqual(["local", "network"]);
    expect(container.querySelector('input[name="autoPrint"]')).toBeNull();
    expect(screen.queryByText(/Chrome/)).toBeNull();
  });

  it("lists the installed Windows printers", async () => {
    const { container } = renderPrinters();

    const select = await openEdit(container);
    const values = Array.from(select.options).map((option) => option.value);

    expect(values).toContain("XP-80C");
    expect(values).toContain("kitchen");
  });

  it("submits the selected system printer as a local connection", async () => {
    const { container } = renderPrinters();

    const select = await openEdit(container);
    fireEvent.change(select, { target: { value: "kitchen" } });
    fireEvent.click(screen.getByText("حفظ التعديلات"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("connectionType")).toBe("local");
    expect(formData.get("host")).toBe("kitchen");
    expect(formData.get("port")).toBe("0");
  });

  it("blocks saving until a specific Windows queue is chosen", async () => {
    const { container } = renderPrinters([legacyLocalPrinter]);

    const select = await openEdit(container);
    expect(select.value).toBe("");
    expect(
      screen.getAllByText(/اختر طابعة Windows محددة/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("حفظ التعديلات"));
    expect(upsertPrinter).not.toHaveBeenCalled();
  });

  it("submits host and port for a network printer", async () => {
    const { container } = renderPrinters([networkPrinter]);

    fireEvent.click(screen.getByTitle("تعديل"));
    const host = (await waitFor(() => {
      const input = container.querySelector(
        'input[name="host"]',
      ) as HTMLInputElement | null;
      expect(input).toBeTruthy();
      return input as HTMLInputElement;
    })) as HTMLInputElement;
    const port = container.querySelector(
      'input[name="port"]',
    ) as HTMLInputElement;

    fireEvent.change(host, { target: { value: "192.168.1.90" } });
    fireEvent.change(port, { target: { value: "9101" } });
    fireEvent.click(screen.getByText("حفظ التعديلات"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("connectionType")).toBe("network");
    expect(formData.get("host")).toBe("192.168.1.90");
    expect(formData.get("port")).toBe("9101");
  });

  it("lets a kitchen printer use the system printer connection", async () => {
    const { container } = renderPrinters([]);

    fireEvent.click(screen.getByText("إضافة طابعة"));
    const role = container.querySelector(
      'select[name="role"]',
    ) as HTMLSelectElement;
    fireEvent.change(role, { target: { value: "kitchen" } });

    const connection = container.querySelector(
      'select[name="connectionType"]',
    ) as HTMLSelectElement;
    expect(
      Array.from(connection.options).map((option) => option.value),
    ).toEqual(["local", "network"]);

    const select = await waitFor(() => {
      const element = container.querySelector(
        'select[name="host"]',
      ) as HTMLSelectElement | null;
      expect(element).toBeTruthy();
      expect(
        element!.querySelector('option[value="XP-80C"]'),
      ).toBeTruthy();
      return element as HTMLSelectElement;
    });
    fireEvent.change(select, { target: { value: "XP-80C" } });
    fireEvent.click(screen.getByText("إضافة"));

    await waitFor(() => expect(upsertPrinter).toHaveBeenCalled());

    const formData = vi.mocked(upsertPrinter).mock.calls[0][0] as FormData;
    expect(formData.get("role")).toBe("kitchen");
    expect(formData.get("connectionType")).toBe("local");
    expect(formData.get("host")).toBe("XP-80C");
  });

  it("warns in the table about a legacy default-queue printer", () => {
    renderPrinters([legacyLocalPrinter]);

    expect(screen.getByText("تحتاج تحديد")).toBeInTheDocument();
    expect(screen.getByText("اختر طابعة Windows محددة")).toBeInTheDocument();
  });
});
