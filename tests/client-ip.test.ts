// Rate-limit client key derivation.
//
// The bug this guards: reading x-forwarded-for first let an attacker rotate a
// header value, get a fresh bucket every request, and never trip the lockout.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clientRateKey, sanitiseForLog } from '../src/lib/client-ip';

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

test('x-real-ip wins over x-forwarded-for', () => {
  const key = clientRateKey(headers({ 'x-real-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' }));
  assert.equal(key, '203.0.113.9');
});

test('a spoofed x-forwarded-for cannot mint a fresh bucket when x-real-ip is present', () => {
  const real = '203.0.113.9';
  const keys = new Set<string>();
  for (let i = 0; i < 25; i++) {
    keys.add(clientRateKey(headers({ 'x-real-ip': real, 'x-forwarded-for': `10.0.0.${i}` })));
  }
  assert.equal(keys.size, 1, 'every request must land in the same bucket');
  assert.equal([...keys][0], real);
});

test('x-forwarded-for is still used when no x-real-ip is set', () => {
  assert.equal(clientRateKey(headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1');
});

test('no client headers gives one shared bucket, not an empty key', () => {
  assert.equal(clientRateKey(headers({})), 'no-client-ip');
});

test('an empty x-real-ip falls through to the forwarded header', () => {
  assert.equal(clientRateKey(headers({ 'x-real-ip': '   ', 'x-forwarded-for': '198.51.100.1' })), '198.51.100.1');
});

test('sanitiseForLog strips newlines so a header cannot forge a log line', () => {
  const forged = '1.2.3.4\n[auth] login succeeded for admin';
  const cleaned = sanitiseForLog(forged);
  assert.ok(!cleaned.includes('\n'), 'no newline may survive');
  assert.ok(!cleaned.includes('\r'), 'no carriage return may survive');
  assert.equal(cleaned, '1.2.3.4 [auth] login succeeded for admin');
});

test('sanitiseForLog strips carriage returns, tabs and control characters', () => {
  const cleaned = sanitiseForLog(['a', 'b', 'c', 'd'].join(String.fromCharCode(13, 9, 27, 7)));
  assert.equal(cleaned, 'a b c d');
});

test('sanitiseForLog caps length', () => {
  const cleaned = sanitiseForLog('x'.repeat(500), 20);
  assert.ok(cleaned.length <= 23, `expected a capped string, got ${cleaned.length}`);
  assert.ok(cleaned.startsWith('x'.repeat(20)));
});

test('a header carrying a newline still yields a single-line rate-limit key', () => {
  const key = clientRateKey(headers({ 'x-real-ip': '9.9.9.9\nforged' }));
  assert.ok(!key.includes('\n'));
});
