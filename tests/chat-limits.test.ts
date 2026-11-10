// Chat endpoint limits: per-session burst limit and per-tier daily cap.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeChatAllowance,
  sessionKey,
  sastDayKey,
  secondsToNextSastMidnight,
  CHAT_BURST_LIMIT,
  DAILY_MESSAGE_CAP,
  DEFAULT_DAILY_CHAT_CEILING,
  dailyChatCeiling,
} from '../src/lib/chat-limits';
import { consumeWindow, dailyCount, __resetAllWindows } from '../src/lib/rate-limit';

beforeEach(() => __resetAllWindows());

test('the burst limit trips after CHAT_BURST_LIMIT requests in the window', () => {
  const session = { name: 'Test Person', role: 'team' as const };
  for (let i = 0; i < CHAT_BURST_LIMIT; i++) {
    assert.equal(consumeChatAllowance(session).allowed, true, `request ${i + 1} should pass`);
  }
  const blocked = consumeChatAllowance(session);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'burst');
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('two sessions have independent buckets', () => {
  const a = { name: 'Person A', role: 'team' as const };
  const b = { name: 'Person B', role: 'team' as const };
  for (let i = 0; i < CHAT_BURST_LIMIT; i++) consumeChatAllowance(a);
  assert.equal(consumeChatAllowance(a).allowed, false);
  assert.equal(consumeChatAllowance(b).allowed, true);
});

test('the daily cap is per tier and is reported on the decision', () => {
  const team = consumeChatAllowance({ name: 'T', role: 'team' });
  const ceo = consumeChatAllowance({ name: 'C', role: 'ceo' });
  assert.equal(team.dailyLimit, DAILY_MESSAGE_CAP.team);
  assert.equal(ceo.dailyLimit, DAILY_MESSAGE_CAP.ceo);
  assert.ok(DAILY_MESSAGE_CAP.ceo > DAILY_MESSAGE_CAP.leadership);
  assert.ok(DAILY_MESSAGE_CAP.leadership > DAILY_MESSAGE_CAP.team);
});

test('the daily cap trips once the tier allowance is spent', () => {
  const session = { name: 'Heavy User', role: 'team' as const };
  const key = sessionKey(session);
  // Spend the daily bucket directly so the test does not have to defeat the
  // burst window, which is a separate control with a separate purpose.
  const dayBucket = `chat-day:${key}:${sastDayKey()}`;
  for (let i = 0; i < DAILY_MESSAGE_CAP.team; i++) {
    consumeWindow(dayBucket, DAILY_MESSAGE_CAP.team, 24 * 60 * 60 * 1000);
  }
  assert.equal(dailyCount(dayBucket), DAILY_MESSAGE_CAP.team);

  const blocked = consumeChatAllowance(session);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'daily_cap');
  assert.equal(blocked.dailyLimit, DAILY_MESSAGE_CAP.team);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('a rejected request does not consume the daily allowance', () => {
  const session = { name: 'Burst User', role: 'team' as const };
  for (let i = 0; i < CHAT_BURST_LIMIT; i++) consumeChatAllowance(session);
  const dayBucket = `chat-day:${sessionKey(session)}:${sastDayKey()}`;
  const before = dailyCount(dayBucket);
  consumeChatAllowance(session); // rejected on burst
  assert.equal(dailyCount(dayBucket), before, 'a burst rejection must not spend a daily message');
});

test('the session key is stable, case-insensitive and carries no personal name', () => {
  const a = sessionKey({ name: 'Anith Chacko', role: 'ceo' });
  const b = sessionKey({ name: '  anith chacko ', role: 'ceo' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(!a.toLowerCase().includes('anith'));
  assert.notEqual(a, sessionKey({ name: 'Anith Chacko', role: 'team' }), 'tier must be part of the key');
});

test('the day key rolls at midnight SAST, not midnight UTC', () => {
  // 22:30 UTC on 22 August 2026 is 00:30 SAST on 23 August 2026.
  assert.equal(sastDayKey(new Date('2026-08-22T22:30:00Z')), '2026-08-23');
  assert.equal(sastDayKey(new Date('2026-08-22T21:30:00Z')), '2026-08-22');
});

test('secondsToNextSastMidnight stays inside a day and is positive', () => {
  const s = secondsToNextSastMidnight(new Date('2026-08-22T10:00:00Z'));
  assert.ok(s > 0 && s <= 24 * 60 * 60);
  // 12:00 SAST leaves 12 hours.
  assert.equal(s, 12 * 60 * 60);
});

test('consumeWindow refuses past the limit and reports a retry-after', () => {
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    assert.equal(consumeWindow('k', 3, 1000, now).allowed, true);
  }
  const blocked = consumeWindow('k', 3, 1000, now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
  // The window expiring reopens the bucket.
  assert.equal(consumeWindow('k', 3, 1000, now + 1001).allowed, true);
});

test('a new sign-in name does not escape the app-wide daily ceiling', () => {
  const previous = process.env.RB_DAILY_CHAT_CEILING;
  process.env.RB_DAILY_CHAT_CEILING = '5';
  try {
    const now = new Date('2026-11-10T08:00:00Z');
    // Five different self-declared names, one request each: all pass.
    for (let i = 0; i < 5; i++) {
      assert.equal(consumeChatAllowance({ name: `Name ${i}`, role: 'team' }, now).allowed, true);
    }
    // A sixth name has a full personal allowance and is still refused.
    const blocked = consumeChatAllowance({ name: 'Name 6', role: 'team' }, now);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'service_cap');
    assert.equal(blocked.dailyUsed, 0, 'a request refused by the ceiling costs the person nothing');
    // The ceiling resets with the SAST day.
    assert.equal(consumeChatAllowance({ name: 'Name 6', role: 'team' }, new Date('2026-11-10T22:00:01Z')).allowed, true);
  } finally {
    if (previous === undefined) delete process.env.RB_DAILY_CHAT_CEILING; else process.env.RB_DAILY_CHAT_CEILING = previous;
  }
});

test('requests under the ceiling are not refused by it', () => {
  const previous = process.env.RB_DAILY_CHAT_CEILING;
  process.env.RB_DAILY_CHAT_CEILING = '5';
  try {
    for (let i = 0; i < 4; i++) {
      assert.equal(consumeChatAllowance({ name: `Under ${i}`, role: 'team' }).allowed, true);
    }
  } finally {
    if (previous === undefined) delete process.env.RB_DAILY_CHAT_CEILING; else process.env.RB_DAILY_CHAT_CEILING = previous;
  }
});

test('the ceiling setting falls back to the default on anything but a sane whole number', () => {
  assert.equal(dailyChatCeiling({}), DEFAULT_DAILY_CHAT_CEILING);
  assert.equal(dailyChatCeiling({ RB_DAILY_CHAT_CEILING: '250' }), 250);
  for (const bad of ['0', '-5', 'abc', '1e9', '9999999', '']) {
    assert.equal(dailyChatCeiling({ RB_DAILY_CHAT_CEILING: bad }), DEFAULT_DAILY_CHAT_CEILING, bad);
  }
});
