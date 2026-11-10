// Small in-memory per-IP login throttle with a short lockout.
//
// Scope and caveats: this is process-local. It protects a single Node instance
// well (the app's target deployments are a single container behind Nginx, per
// GO-LIVE Option B, or one Vercel function). Across many serverless instances it
// only throttles per instance, so pair it with a platform WAF/edge rate rule for
// a hard guarantee. It is deliberately dependency-free and good enough to blunt
// online brute force against short shared passcodes.

const WINDOW_MS = 15 * 60 * 1000; // failures are counted over 15 minutes
const MAX_FAILURES = 8; // attempts allowed before lockout
const LOCKOUT_MS = 5 * 60 * 1000; // lockout duration once tripped

interface Entry {
  failures: number;
  first: number; // window start
  lockedUntil: number; // 0 when not locked
}

const buckets = new Map<string, Entry>();

// Opportunistic cleanup so the map cannot grow without bound.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [ip, e] of buckets) {
    if (e.lockedUntil < now && now - e.first > WINDOW_MS) buckets.delete(ip);
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const e = buckets.get(ip);
  if (e && e.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((e.lockedUntil - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailure(ip: string): { failures: number; locked: boolean } {
  const now = Date.now();
  sweep(now);
  let e = buckets.get(ip);
  if (!e || now - e.first > WINDOW_MS) {
    e = { failures: 0, first: now, lockedUntil: 0 };
    buckets.set(ip, e);
  }
  e.failures += 1;
  if (e.failures >= MAX_FAILURES) {
    e.lockedUntil = now + LOCKOUT_MS;
  }
  return { failures: e.failures, locked: e.lockedUntil > now };
}

export function resetRateLimit(ip: string): void {
  buckets.delete(ip);
}

// Exposed for tests.
export const __config = { WINDOW_MS, MAX_FAILURES, LOCKOUT_MS };

// ── Generic fixed-window request counter ─────────────────────────────────────
//
// The login throttle above counts failures; this counts requests. Same module,
// same process-local caveat, reused by the chat endpoint keyed on a session
// identifier rather than an IP (see src/lib/chat-limits.ts).

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

function sweepWindows(now: number) {
  if (windows.size < 5000) return;
  for (const [key, e] of windows) {
    if (e.resetAt <= now) windows.delete(key);
  }
}

export interface WindowDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  count: number;
}

/** Consume one unit from a fixed window. A rejected call does not consume. */
export function consumeWindow(key: string, limit: number, windowMs: number, now = Date.now()): WindowDecision {
  sweepWindows(now);
  let e = windows.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + windowMs };
    windows.set(key, e);
  }
  if (e.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((e.resetAt - now) / 1000)),
      count: e.count,
    };
  }
  e.count += 1;
  return { allowed: true, remaining: limit - e.count, retryAfterSeconds: 0, count: e.count };
}

/** Read a window's current count without consuming. */
export function dailyCount(key: string, now = Date.now()): number {
  const e = windows.get(key);
  if (!e || e.resetAt <= now) return 0;
  return e.count;
}

export function resetWindow(key: string): void {
  windows.delete(key);
}

/** Test helper: drop every window bucket. */
export function __resetAllWindows(): void {
  windows.clear();
}
