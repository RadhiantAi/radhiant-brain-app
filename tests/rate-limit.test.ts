// Login rate-limiter unit tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit, recordFailure, resetRateLimit, __config } from '../src/lib/rate-limit';

test('allows attempts until the failure threshold, then locks out', () => {
  const ip = 'test-ip-lockout';
  resetRateLimit(ip);

  assert.equal(checkRateLimit(ip).allowed, true);

  let last = { failures: 0, locked: false };
  for (let i = 0; i < __config.MAX_FAILURES; i++) {
    last = recordFailure(ip);
  }
  assert.equal(last.locked, true, 'should lock after MAX_FAILURES');

  const gate = checkRateLimit(ip);
  assert.equal(gate.allowed, false, 'locked ip must be blocked');
  assert.ok(gate.retryAfterSeconds > 0, 'should report a positive retry-after');

  resetRateLimit(ip);
});

test('a successful reset clears the counter', () => {
  const ip = 'test-ip-reset';
  resetRateLimit(ip);
  recordFailure(ip);
  recordFailure(ip);
  resetRateLimit(ip);
  assert.equal(checkRateLimit(ip).allowed, true);
});

test('independent IPs do not affect each other', () => {
  const a = 'test-ip-a';
  const b = 'test-ip-b';
  resetRateLimit(a);
  resetRateLimit(b);
  for (let i = 0; i < __config.MAX_FAILURES; i++) recordFailure(a);
  assert.equal(checkRateLimit(a).allowed, false);
  assert.equal(checkRateLimit(b).allowed, true);
  resetRateLimit(a);
  resetRateLimit(b);
});
