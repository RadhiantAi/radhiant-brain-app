// Per-session limits and a daily cap for POST /api/chat.
//
// Before this, the rate limiter guarded login only: chat checked the session
// and then streamed, so one shared passcode plus a script was an unbounded
// Anthropic bill with no record of what was spent.
//
// Two controls, both keyed on a session identifier rather than an IP (the
// people who can reach this endpoint have already authenticated, so the useful
// subject is the session, not the network path):
//   - a short-window burst limit, and
//   - a per-tier daily message cap.
// A third control, the app-wide daily ceiling, is keyed on nothing the person
// supplies (see DEFAULT_DAILY_CHAT_CEILING below).
//
// Same honest caveat as src/lib/rate-limit.ts: the counters are process-local,
// so across many warm serverless instances they bound per instance rather than
// globally. That is a real ceiling on a single-container deployment (GO-LIVE
// Option B) and a blunt-the-worst-case control on Vercel. The durable version
// lands with the shared storage plane (see docs/IMPROVEMENT_PLAN_2026-08-22.md).

import { createHash } from 'node:crypto';
import { Role } from './auth';
import { consumeWindow, dailyCount } from './rate-limit';

// Burst limit: requests allowed per session inside the window.
export const CHAT_BURST_LIMIT = 12;
export const CHAT_BURST_WINDOW_MS = 60 * 1000;

// Daily message cap per access tier.
export const DAILY_MESSAGE_CAP: Record<Role, number> = {
  team: 60,
  leadership: 150,
  ceo: 400,
};

// App-wide daily ceiling across every session and tier.
//
// The per-session cap above is keyed on the name typed at sign-in. With shared
// passcodes that name is self-declared, so signing in again under another name
// starts a fresh allowance. This ceiling does not depend on the name, so the
// total a shared passcode can spend in a day is bounded whatever names are used.
// Override with RB_DAILY_CHAT_CEILING (a whole number from 1 to 100000).
export const DEFAULT_DAILY_CHAT_CEILING = 400;

export function dailyChatCeiling(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.RB_DAILY_CHAT_CEILING ?? '').trim();
  if (!/^\d{1,6}$/.test(raw)) return DEFAULT_DAILY_CHAT_CEILING;
  const n = Number(raw);
  return n >= 1 && n <= 100000 ? n : DEFAULT_DAILY_CHAT_CEILING;
}

export interface SessionIdentity {
  name: string;
  role: Role;
}

// A stable, non-identifying key for a session. Hashed so no personal name lands
// in a counter key or a log line, and truncated because collision resistance
// beyond this adds nothing for a rate-limit bucket.
export function sessionKey(session: SessionIdentity): string {
  return createHash('sha256').update(`${session.role}|${session.name.trim().toLowerCase()}`).digest('hex').slice(0, 16);
}

// The calendar day a request belongs to, in SAST (UTC+2, no DST). Caps should
// reset overnight for the people using the app, not at 02:00 local.
export function sastDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface ChatLimitDecision {
  allowed: boolean;
  reason?: 'burst' | 'daily_cap' | 'service_cap';
  retryAfterSeconds: number;
  dailyUsed: number;
  dailyLimit: number;
}

/**
 * Consume one chat allowance for this session. Call once per accepted request;
 * a rejected request does not consume the daily cap.
 */
export function consumeChatAllowance(session: SessionIdentity, now: Date = new Date()): ChatLimitDecision {
  const key = sessionKey(session);
  const dailyLimit = DAILY_MESSAGE_CAP[session.role] ?? DAILY_MESSAGE_CAP.team;
  const dayBucket = `chat-day:${key}:${sastDayKey(now)}`;

  const burst = consumeWindow(`chat-burst:${key}`, CHAT_BURST_LIMIT, CHAT_BURST_WINDOW_MS, now.getTime());
  if (!burst.allowed) {
    return {
      allowed: false,
      reason: 'burst',
      retryAfterSeconds: burst.retryAfterSeconds,
      dailyUsed: dailyCount(dayBucket),
      dailyLimit,
    };
  }

  // Midnight SAST, expressed as seconds from now.
  const resetSeconds = Math.max(1, secondsToNextSastMidnight(now));

  // Read the app-wide ceiling before spending the session's allowance, so a
  // request refused here costs the person nothing.
  const ceiling = dailyChatCeiling();
  const allBucket = `chat-all:${sastDayKey(now)}`;
  if (dailyCount(allBucket, now.getTime()) >= ceiling) {
    return { allowed: false, reason: 'service_cap', retryAfterSeconds: resetSeconds, dailyUsed: dailyCount(dayBucket, now.getTime()), dailyLimit };
  }

  const day = consumeWindow(dayBucket, dailyLimit, resetSeconds * 1000, now.getTime());
  if (!day.allowed) {
    return { allowed: false, reason: 'daily_cap', retryAfterSeconds: resetSeconds, dailyUsed: dailyLimit, dailyLimit };
  }
  consumeWindow(allBucket, ceiling, resetSeconds * 1000, now.getTime());

  return { allowed: true, retryAfterSeconds: 0, dailyUsed: dailyLimit - day.remaining, dailyLimit };
}

export function secondsToNextSastMidnight(now: Date = new Date()): number {
  const sastMs = now.getTime() + 2 * 60 * 60 * 1000;
  const sinceMidnight = sastMs % (24 * 60 * 60 * 1000);
  return Math.ceil((24 * 60 * 60 * 1000 - sinceMidnight) / 1000);
}
