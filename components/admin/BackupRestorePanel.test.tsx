import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupRestorePanel } from "./BackupRestorePanel";

const refresh = vi.fn();
const showToast = vi.fn();
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ showToast }),
}));

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  showToast.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function pickArchive() {
  const input = screen.getByLabelText(/ملف النسخة الاحتياطية/);
  const file = new File([new Uint8Array([1, 2, 3])], "backup.fastpos", {
    type: "application/zip",
  });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function submitRestore() {
  fireEvent.click(
    screen.getByRole("button", { name: /استعادة النسخة الاحتياطية/ }),
  );
}

function mockRestoreResponse(body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("BackupRestorePanel", () => {
  it("links to the backup download endpoint", () => {
    render(<BackupRestorePanel />);

    expect(
      screen.getByRole("link", { name: /تنزيل نسخة احتياطية/ }),
    ).toHaveAttribute("href", "/api/admin/backup");
  });

  it("requires a file and the admin password before calling the server", () => {
    render(<BackupRestorePanel />);

    submitRestore();
    expect(
      screen.getByText("اختر ملف النسخة الاحتياطية أولاً"),
    ).toBeInTheDocument();

    pickArchive();
    submitRestore();
    expect(screen.getByText("أدخل كلمة مرور المدير")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads the archive with the password and reports the result", async () => {
    mockRestoreResponse({
      ok: true,
      counts: { venues: 1, users: 3, items: 12, orders: 40 },
      replacedOpenShifts: 0,
      safetyBackup: "pre-restore-20261025-190000-000.db",
      logo: "restored",
    });
    render(<BackupRestorePanel />);

    const file = pickArchive();
    fireEvent.change(screen.getByLabelText(/كلمة مرور المدير/), {
      target: { value: "secret123" },
    });
    submitRestore();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/backup/restore");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("password")).toBe("secret123");
    expect((form.get("file") as File).name).toBe(file.name);

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        "success",
        "تمت استعادة النسخة الاحتياطية بنجاح",
      ),
    );
    expect(
      screen.getByText(/pre-restore-20261025-190000-000\.db/),
    ).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText(/وردية مفتوحة أثناء الاستعادة/)).toBeNull();
  });

  it("shows the open-shift warning returned by the server", async () => {
    mockRestoreResponse({
      ok: true,
      counts: { venues: 1, users: 3, items: 12, orders: 40 },
      replacedOpenShifts: 1,
      safetyBackup: "pre-restore-20261025-190000-000.db",
      logo: "kept",
    });
    render(<BackupRestorePanel />);

    pickArchive();
    fireEvent.change(screen.getByLabelText(/كلمة مرور المدير/), {
      target: { value: "secret123" },
    });
    submitRestore();

    await waitFor(() =>
      expect(
        screen.getByText(/كانت هناك وردية مفتوحة أثناء الاستعادة/),
      ).toBeInTheDocument(),
    );
  });

  it("shows the server error when the password is wrong", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "كلمة المرور غير صحيحة" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<BackupRestorePanel />);

    pickArchive();
    fireEvent.change(screen.getByLabelText(/كلمة مرور المدير/), {
      target: { value: "wrong" },
    });
    submitRestore();

    await waitFor(() =>
      expect(screen.getByText("كلمة المرور غير صحيحة")).toBeInTheDocument(),
    );
    expect(showToast).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
