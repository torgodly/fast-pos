import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinPad } from "./PinPad";

describe("PinPad", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          redirectTo: "/waiter/cafe",
        }),
      }),
    );
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("submits when دخول is pressed after 4 digits", async () => {
    const user = userEvent.setup();
    render(<PinPad venueId="cafe" venueName="كافيه" />);

    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /دخول/ }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/pin",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ venueId: "cafe", pin: "1111" }),
      }),
    );

    await waitFor(() => {
      expect(window.location.href).toBe("/waiter/cafe");
    });
  });

  it("shows an error and clears the PIN on failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({ error: "رمز الدخول غير صحيح" }),
    } as Response);

    const user = userEvent.setup();
    render(<PinPad venueId="restaurant" venueName="مطعم" />);

    const nine = screen.getByRole("button", { name: "9" });
    await user.click(nine);
    await user.click(nine);
    await user.click(nine);
    await user.click(nine);
    await user.click(screen.getByRole("button", { name: /دخول/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "رمز الدخول غير صحيح",
    );
  });

  it("asks to pick a user when several share the PIN", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        needUserPick: true,
        candidates: [
          { id: 1, name: "أحمد", role: "waiter" },
          { id: 2, name: "سارة", role: "cashier" },
        ],
      }),
    } as Response);

    const user = userEvent.setup();
    render(<PinPad venueId="cafe" venueName="كافيه" />);

    for (const digit of ["0", "0", "0", "0"]) {
      await user.click(screen.getByRole("button", { name: digit }));
    }
    await user.click(screen.getByRole("button", { name: /دخول/ }));

    expect(await screen.findByText("من أنت؟")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /أحمد/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /سارة/ })).toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        redirectTo: "/cashier/cafe",
      }),
    } as Response);

    await user.click(screen.getByRole("button", { name: /أحمد/ }));

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        "/api/auth/pin",
        expect.objectContaining({
          body: JSON.stringify({ venueId: "cafe", pin: "0000", userId: 1 }),
        }),
      );
    });

    await waitFor(() => {
      expect(window.location.href).toBe("/cashier/cafe");
    });
  });
});
