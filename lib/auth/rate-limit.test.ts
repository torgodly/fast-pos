import { afterEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clearAuthFailures,
  clientRateLimitKey,
  recordAuthFailure,
  resetRateLimitStore,
} from "./rate-limit";

afterEach(() => {
  resetRateLimitStore();
});

describe("PIN rate limit", () => {
  it("allows requests under the failure threshold", () => {
    const key = "pin:1.1.1.1:cafe";
    expect(checkRateLimit(key).ok).toBe(true);
    for (let i = 0; i < 7; i++) {
      expect(recordAuthFailure(key).locked).toBe(false);
      expect(checkRateLimit(key).ok).toBe(true);
    }
  });

  it("locks after max failures", () => {
    const key = "pin:2.2.2.2:restaurant";
    for (let i = 0; i < 8; i++) {
      recordAuthFailure(key);
    }
    const blocked = checkRateLimit(key);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("clears failures after success", () => {
    const key = "pin:3.3.3.3:cafe";
    for (let i = 0; i < 7; i++) {
      recordAuthFailure(key);
    }
    clearAuthFailures(key);
    expect(checkRateLimit(key).ok).toBe(true);
    expect(recordAuthFailure(key).locked).toBe(false);
  });

  it("builds a stable client key from forwarded IP + venue", () => {
    const request = new Request("http://localhost/api/auth/pin", {
      headers: { "x-forwarded-for": "10.0.0.8, 10.0.0.1" },
    });
    expect(clientRateLimitKey(request, "cafe")).toBe("pin:10.0.0.8:cafe");
  });
});
