// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashStaffPin } from "@/lib/auth/pin";
import { resetRateLimitStore } from "@/lib/auth/rate-limit";

const holder = vi.hoisted(() => ({
  sqlite: null as import("better-sqlite3").Database | null,
}));

vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      venue_id TEXT,
      username TEXT,
      password_hash TEXT,
      pin_hash TEXT,
      is_main_cashier INTEGER NOT NULL DEFAULT 0,
      must_change_pin INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  holder.sqlite = sqlite;
  return { db: drizzle(sqlite, { schema }) };
});

vi.mock("@/lib/activation/service", () => ({
  getActivationStatus: () => ({ canOperate: true }),
}));

vi.mock("@/lib/deployment", () => ({
  isCounterMode: () => false,
  isActiveVenueId: (id: string) => id === "restaurant" || id === "cafe",
  staffLandingPath: (role: string, venueId: string) => `/${venueId}/${role}`,
}));

const { POST } = await import("./route");

function login(ip: string, pin: string, venueId = "restaurant") {
  return POST(
    new Request("http://localhost/api/auth/pin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ venueId, pin }),
    }),
  );
}

describe("POST /api/auth/pin rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStore();
    holder.sqlite!.exec(`DELETE FROM users`);
    holder.sqlite!
      .prepare(
        `INSERT INTO users (name, role, venue_id, pin_hash, active) VALUES (?, 'cashier', 'restaurant', ?, 1)`,
      )
      .run("Cashier", hashStaffPin("2580"));
  });

  afterEach(() => {
    resetRateLimitStore();
  });

  it("rejects a wrong PIN and accepts the right one", async () => {
    expect((await login("203.0.113.10", "1111")).status).toBe(401);
    expect((await login("203.0.113.10", "2580")).status).toBe(200);
  });

  it("locks the client after 8 wrong PINs, even with the correct PIN", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await login("203.0.113.11", "9999")).status).toBe(401);
    }

    const blocked = await login("203.0.113.11", "2580");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("clears failures after a successful login", async () => {
    for (let i = 0; i < 7; i++) {
      await login("203.0.113.12", "9999");
    }
    expect((await login("203.0.113.12", "2580")).status).toBe(200);

    for (let i = 0; i < 7; i++) {
      expect((await login("203.0.113.12", "9999")).status).toBe(401);
    }
  });

  it("locks per venue, not per client", async () => {
    for (let i = 0; i < 8; i++) {
      await login("203.0.113.13", "9999", "restaurant");
    }
    expect((await login("203.0.113.13", "2580", "restaurant")).status).toBe(429);
    expect((await login("203.0.113.13", "2580", "cafe")).status).toBe(200);
  });
});
