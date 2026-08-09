import { afterEach, describe, expect, it } from "vitest";
import { getSessionSecretBytes } from "./token";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("session secret", () => {
  it("uses a dev fallback outside production when unset", () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = "development";
    const bytes = getSessionSecretBytes();
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("throws in production when SESSION_SECRET is missing", () => {
    delete process.env.SESSION_SECRET;
    process.env.NODE_ENV = "production";
    expect(() => getSessionSecretBytes()).toThrow(/SESSION_SECRET/);
  });

  it("uses SESSION_SECRET when provided", () => {
    process.env.SESSION_SECRET = "unit-test-secret";
    process.env.NODE_ENV = "production";
    const bytes = getSessionSecretBytes();
    expect(new TextDecoder().decode(bytes)).toBe("unit-test-secret");
  });
});
