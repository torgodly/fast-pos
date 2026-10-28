// @vitest-environment node
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const { POST } = await import("./route");

function login(ip: string, password: string) {
  return POST(
    new Request("http://localhost/api/auth/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ username: "admin", password }),
    }),
  );
}

describe("POST /api/auth/admin rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStore();
    holder.sqlite!.exec(`DELETE FROM users`);
    holder.sqlite!
      .prepare(
        `INSERT INTO users (name, role, username, password_hash, active) VALUES (?, 'admin', 'admin', ?, 1)`,
      )
      .run("Admin", bcrypt.hashSync("123", 10));
  });

  afterEach(() => {
    resetRateLimitStore();
  });

  it("rejects invalid credentials and allows valid ones", async () => {
    expect((await login("198.51.100.1", "wrong")).status).toBe(401);
    expect((await login("198.51.100.1", "123")).status).toBe(200);
  });

  it("locks the client after 8 failures, even with the correct password", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await login("198.51.100.2", "wrong")).status).toBe(401);
    }

    const blocked = await login("198.51.100.2", "123");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("clears failures after a successful login", async () => {
    for (let i = 0; i < 7; i++) {
      await login("198.51.100.3", "wrong");
    }
    expect((await login("198.51.100.3", "123")).status).toBe(200);

    for (let i = 0; i < 7; i++) {
      expect((await login("198.51.100.3", "wrong")).status).toBe(401);
    }
  });

  it("throttles each client independently", async () => {
    for (let i = 0; i < 8; i++) {
      await login("198.51.100.4", "wrong");
    }
    expect((await login("198.51.100.4", "123")).status).toBe(429);
    expect((await login("198.51.100.5", "123")).status).toBe(200);
  });
});
