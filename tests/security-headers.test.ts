// Every response must carry the baseline security headers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { securityHeaders } from '../security-headers.mjs';
import nextConfig from '../next.config.mjs';

const header = (list: { key: string; value: string }[], key: string) =>
  list.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value ?? '';

test('the baseline headers are present with safe values', () => {
  assert.match(header(securityHeaders, 'Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(header(securityHeaders, 'X-Frame-Options'), 'DENY');
  assert.equal(header(securityHeaders, 'X-Content-Type-Options'), 'nosniff');
  assert.equal(header(securityHeaders, 'Referrer-Policy'), 'no-referrer');
  assert.match(header(securityHeaders, 'Strict-Transport-Security'), /max-age=\d{8,}/);
});

test('next.config applies them to every route and hides the framework header', async () => {
  assert.ok(nextConfig.headers, 'next.config must define headers()');
  const rules = await nextConfig.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/:path*');
  assert.deepEqual(rules[0].headers, securityHeaders);
  assert.equal(nextConfig.poweredByHeader, false);
});

test('a header list missing the framing rule is detected', () => {
  const weakened = securityHeaders.filter((h) => h.key !== 'Content-Security-Policy');
  assert.doesNotMatch(header(weakened, 'Content-Security-Policy'), /frame-ancestors/);
});
