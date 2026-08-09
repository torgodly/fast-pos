type Bucket = {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();

export const PIN_RATE_LIMIT = {
  /** Max failed attempts inside the window before lockout. */
  maxFailures: 8,
  /** Sliding window for counting failures (ms). */
  windowMs: 15 * 60 * 1000,
  /** Lockout duration after max failures (ms). */
  lockMs: 5 * 60 * 1000,
} as const;

function now() {
  return Date.now();
}

function getBucket(key: string): Bucket {
  const existing = buckets.get(key);
  if (existing) return existing;
  const created: Bucket = {
    failures: 0,
    windowStartedAt: now(),
    lockedUntil: 0,
  };
  buckets.set(key, created);
  return created;
}

/** Test helper — clears all in-memory rate-limit state. */
export function resetRateLimitStore() {
  buckets.clear();
}

export function checkRateLimit(
  key: string,
  config = PIN_RATE_LIMIT,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const bucket = getBucket(key);
  const t = now();

  if (bucket.lockedUntil > t) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - t) / 1000)),
    };
  }

  if (t - bucket.windowStartedAt > config.windowMs) {
    bucket.failures = 0;
    bucket.windowStartedAt = t;
    bucket.lockedUntil = 0;
  }

  return { ok: true };
}

export function recordAuthFailure(
  key: string,
  config = PIN_RATE_LIMIT,
): { locked: boolean; retryAfterSec: number } {
  const bucket = getBucket(key);
  const t = now();

  if (t - bucket.windowStartedAt > config.windowMs) {
    bucket.failures = 0;
    bucket.windowStartedAt = t;
  }

  bucket.failures += 1;

  if (bucket.failures >= config.maxFailures) {
    bucket.lockedUntil = t + config.lockMs;
    bucket.failures = 0;
    bucket.windowStartedAt = t;
    return {
      locked: true,
      retryAfterSec: Math.ceil(config.lockMs / 1000),
    };
  }

  return { locked: false, retryAfterSec: 0 };
}

export function clearAuthFailures(key: string) {
  buckets.delete(key);
}

export function clientRateLimitKey(request: Request, venueId: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "local";
  return `pin:${ip}:${venueId}`;
}
