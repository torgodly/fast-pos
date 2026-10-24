import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuExcelBar } from "./MenuExcelBar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("MenuExcelBar", () => {
  it("links to the import template download", () => {
    render(<MenuExcelBar />);

    expect(
      screen.getByRole("link", { name: /تحميل القالب/ }),
    ).toHaveAttribute("href", "/api/admin/menu/template");
  });
});
