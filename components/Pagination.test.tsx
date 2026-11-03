import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { resolvePageInfo } from "@/lib/pagination";
import { Pagination } from "./Pagination";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => {
    return (
      <a href={href} data-prefetch={String(prefetch)} {...rest}>
        {children}
      </a>
    );
  },
}));

describe("Pagination", () => {
  it("renders the range, numbered pages and size links", () => {
    render(
      <Pagination
        basePath="/admin/invoices"
        params={{ venue: "cafe" }}
        info={resolvePageInfo({ page: "5", size: "25" }, 786)}
      />,
    );

    expect(screen.getByText("عرض 101–125 من 786")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "السابق" }).getAttribute("href"),
    ).toBe("/admin/invoices?venue=cafe&page=4");
    expect(
      screen.getByRole("link", { name: "32" }).getAttribute("href"),
    ).toBe("/admin/invoices?venue=cafe&page=32");
    expect(
      screen.getByRole("link", { name: "50" }).getAttribute("href"),
    ).toBe("/admin/invoices?venue=cafe&size=50");
    expect(
      screen.getByRole("link", { name: "السابق" }).getAttribute("data-prefetch"),
    ).toBe("false");
    expect(
      screen.getByRole("link", { name: "32" }).getAttribute("data-prefetch"),
    ).toBe("false");
    expect(
      screen.getByRole("link", { name: "50" }).getAttribute("data-prefetch"),
    ).toBe("false");
    expect(
      screen.getByRole("link", { name: "التالي" }).getAttribute("data-prefetch"),
    ).toBe("false");
    expect(
      screen.getByRole("link", { name: "25" }).getAttribute("aria-current"),
    ).toBe("true");
    expect(
      screen.getByRole("link", { name: "50" }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("renders nothing for an empty result", () => {
    const { container } = render(
      <Pagination
        basePath="/admin/audit"
        params={{}}
        info={resolvePageInfo({}, 0)}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides page buttons when everything fits on one page", () => {
    render(
      <Pagination
        basePath="/admin/shifts"
        params={{ venue: "restaurant" }}
        info={resolvePageInfo({}, 18)}
      />,
    );

    expect(screen.queryByRole("link", { name: "التالي" })).toBeNull();
    expect(screen.queryByText("السابق")).toBeNull();
    expect(screen.getByText("عرض 1–18 من 18")).toBeTruthy();
  });

  it("renders the previous control as a disabled span on the first page", () => {
    render(
      <Pagination
        basePath="/admin/invoices"
        params={{}}
        info={resolvePageInfo({ page: "1", size: "25" }, 786)}
      />,
    );

    expect(screen.queryByRole("link", { name: "السابق" })).toBeNull();
    expect(screen.getByText("السابق").tagName).toBe("SPAN");
    expect(screen.getByText("التالي").tagName).toBe("A");
  });

  it("renders the next control as a disabled span on the last page", () => {
    render(
      <Pagination
        basePath="/admin/invoices"
        params={{}}
        info={resolvePageInfo({ page: "32", size: "25" }, 786)}
      />,
    );

    expect(screen.queryByRole("link", { name: "التالي" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "32" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "31" }).getAttribute("aria-current"),
    ).toBeNull();
  });
});
