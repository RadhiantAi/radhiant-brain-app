import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { createSessionToken, verifySessionToken } from '../src/lib/auth';

process.env.RB_SESSION_SECRET = randomBytes(32).toString('hex');
const now = Math.floor(Date.now() / 1000);
function token(change: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ name: 'Synthetic tester', role: 'team', iat: now - 1, exp: now + 60, ...change })).toString('base64url');
  return body + '.' + createHmac('sha256', process.env.RB_SESSION_SECRET!).update(body).digest('base64url');
}
test('valid sessions work; signed malformed or expired payloads do not', async () => {
  assert.equal((await verifySessionToken(await createSessionToken('Synthetic tester', 'team')))?.role, 'team');
  for (const payload of [{ exp: undefined }, { exp: null }, { exp: '9999999999' }, { exp: now }, { iat: undefined },
    { iat: now + 60 }, { role: 'constructor' }, { name: {} }, { exp: now + 86400 * 20 }]) {
    assert.equal(await verifySessionToken(token(payload)), null, JSON.stringify(payload));
  }
  assert.equal(await verifySessionToken('x'.repeat(9000)), null);
  assert.equal(await verifySessionToken(token({}) + 'tampered'), null);
});
