// Answer instrumentation: aggregate counters, no message text, zero-hit counted.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { recordRetrieval, recordTokenUsage, usageSnapshot, __resetUsage } from '../src/lib/usage';

function captureInfo(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  try {
    fn();
  } finally {
    console.info = original;
  }
  return lines;
}

beforeEach(() => __resetUsage());

test('a zero-hit request is counted, because that list is the content backlog', () => {
  captureInfo(() =>
    recordRetrieval({ tier: 'team', mode: 'ai', hitCount: 0, topScore: 0, staleCount: 0, docSlugs: [] }),
  );
  const snap = usageSnapshot();
  assert.equal(snap.requests, 1);
  assert.equal(snap.zeroHitRequests, 1);
  assert.equal(snap.byTier.team.zeroHit, 1);
});

test('a request with hits is counted but not as a zero-hit', () => {
  captureInfo(() =>
    recordRetrieval({
      tier: 'leadership',
      mode: 'ai',
      hitCount: 4,
      topScore: 7.25,
      staleCount: 1,
      docSlugs: ['finance-snapshot'],
    }),
  );
  const snap = usageSnapshot();
  assert.equal(snap.requests, 1);
  assert.equal(snap.zeroHitRequests, 0);
  assert.equal(snap.byTier.leadership.requests, 1);
});

test('the log line carries tier, hit count, top score and doc slugs, and no message text', () => {
  const lines = captureInfo(() =>
    recordRetrieval({
      tier: 'ceo',
      mode: 'ai',
      hitCount: 2,
      topScore: 3.5,
      staleCount: 0,
      docSlugs: ['ceo-context', 'strategy-fy26'],
    }),
  );
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.event, 'chat_request');
  assert.equal(record.tier, 'ceo');
  assert.equal(record.hits, 2);
  assert.equal(record.topScore, 3.5);
  assert.deepEqual(record.docs, ['ceo-context', 'strategy-fy26']);
  assert.equal(record.zeroHit, false);

  // The whole POPIA posture of this instrumentation: aggregate only. Nothing in
  // the record may be free text from a person.
  const allowed = new Set(['event', 'tier', 'mode', 'hits', 'topScore', 'staleHits', 'docs', 'zeroHit', 'at']);
  for (const key of Object.keys(record)) {
    assert.ok(allowed.has(key), `unexpected key in the chat log record: ${key}`);
  }
});

test('token usage accumulates so monthly spend is knowable', () => {
  captureInfo(() => {
    recordTokenUsage({ tier: 'team', model: 'claude-sonnet-5', inputTokens: 4200, outputTokens: 600 });
    recordTokenUsage({ tier: 'ceo', model: 'claude-sonnet-5', inputTokens: 1000, outputTokens: 400 });
  });
  const snap = usageSnapshot();
  assert.equal(snap.inputTokens, 5200);
  assert.equal(snap.outputTokens, 1000);
  assert.equal(snap.byTier.team.inputTokens, 4200);
  assert.equal(snap.byTier.ceo.outputTokens, 400);
  assert.match(snap.month, /^\d{4}-\d{2}$/);
});

test('the token log line carries no free text either', () => {
  const lines = captureInfo(() =>
    recordTokenUsage({ tier: 'team', model: 'claude-sonnet-5', inputTokens: 10, outputTokens: 5 }),
  );
  const record = JSON.parse(lines[0]);
  const allowed = new Set([
    'event',
    'tier',
    'model',
    'inputTokens',
    'outputTokens',
    'monthInputTokens',
    'monthOutputTokens',
    'month',
    'at',
  ]);
  for (const key of Object.keys(record)) {
    assert.ok(allowed.has(key), `unexpected key in the token log record: ${key}`);
  }
});

test('the snapshot is a copy, so a caller cannot mutate the counters', () => {
  captureInfo(() =>
    recordRetrieval({ tier: 'team', mode: 'search', hitCount: 1, topScore: 1, staleCount: 0, docSlugs: ['x'] }),
  );
  const snap = usageSnapshot();
  snap.requests = 999;
  assert.equal(usageSnapshot().requests, 1);
});
