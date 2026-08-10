import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionSecretBytes } from "./token";

const originalSecret = process.env.SESSION_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  vi.unstubAllEnvs();
  // restore NODE_ENV via stub cleanup; also set back if needed
  if (originalNodeEnv !== undefined) {
    vi.stubEnv("NODE_ENV", originalNodeEnv);
  }
});

describe("session secret", () => {
  it("uses a dev fallback outside production when unset", () => {
    delete process.env.SESSION_SECRET;
    vi.stubEnv("NODE_ENV", "development");
    const bytes = getSessionSecretBytes();
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("throws in production when SESSION_SECRET is missing", () => {
    delete process.env.SESSION_SECRET;
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getSessionSecretBytes()).toThrow(/SESSION_SECRET/);
  });

  it("uses SESSION_SECRET when provided", () => {
    vi.stubEnv("SESSION_SECRET", "unit-test-secret");
    vi.stubEnv("NODE_ENV", "production");
    const bytes = getSessionSecretBytes();
    expect(new TextDecoder().decode(bytes)).toBe("unit-test-secret");
  });
});
