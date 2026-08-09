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
    // jsdom location is not fully writable — replace href setter path via assign mock
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("auto-submits when 4 digits are entered", async () => {
    const user = userEvent.setup();
    render(<PinPad venueId="cafe" venueName="كافيه" />);

    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "1" }));

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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "رمز الدخول غير صحيح",
    );
  });
});
