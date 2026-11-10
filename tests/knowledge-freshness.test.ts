import { installKnowledgeFixture } from './helpers/knowledge-fixture';
installKnowledgeFixture();

// Knowledge freshness governance and retrieval chunking.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDocs,
  getChunks,
  ageInDays,
  isStale,
  splitIntoChunks,
  MAX_CHUNK_CHARS,
  CHUNK_OVERLAP_CHARS,
  STALE_AFTER_DAYS,
} from '../src/lib/knowledge';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test('every knowledge entry carries a review_by date', () => {
  const docs = getDocs('ceo');
  assert.ok(docs.length > 0, 'expected knowledge docs');
  for (const d of docs) {
    assert.match(d.reviewBy, ISO_DATE, `${d.slug} review_by must be an absolute YYYY-MM-DD date`);
    assert.match(d.lastReviewedAt, ISO_DATE, `${d.slug} lastReviewedAt must be an absolute YYYY-MM-DD date`);
  }
});

test('review_by always falls after lastReviewedAt', () => {
  for (const d of getDocs('ceo')) {
    assert.ok(
      Date.parse(`${d.reviewBy}T00:00:00Z`) > Date.parse(`${d.lastReviewedAt}T00:00:00Z`),
      `${d.slug}: review_by ${d.reviewBy} must fall after lastReviewedAt ${d.lastReviewedAt}`,
    );
  }
});

test('every chunk carries the entry review date so retrieval can state its age', () => {
  for (const c of getChunks('ceo')) {
    assert.match(c.lastReviewedAt, ISO_DATE, `${c.id} lost its review date`);
  }
});

test('ageInDays counts whole days and never goes negative', () => {
  const now = new Date('2026-08-22T09:00:00Z');
  assert.equal(ageInDays('2026-07-05', now), 48);
  assert.equal(ageInDays('2026-08-22', now), 0);
  assert.equal(ageInDays('2026-09-01', now), 0, 'a future date reads as fresh, not negative');
  assert.equal(ageInDays('not-a-date', now), -1);
});

test('isStale bites past the threshold and fails closed on a missing date', () => {
  const now = new Date('2026-08-22T09:00:00Z');
  assert.equal(isStale('2026-08-01', now), false);
  assert.equal(isStale('2026-07-05', now), false, '48 days is inside the threshold');
  assert.equal(isStale('2026-05-01', now), true);
  assert.equal(isStale('', now), true, 'no date must read as stale, not as fresh');
  assert.ok(STALE_AFTER_DAYS > 0);
});

test('no retrieval chunk exceeds the size cap', () => {
  const chunks = getChunks('ceo');
  assert.ok(chunks.length > 0);
  for (const c of chunks) {
    assert.ok(
      c.text.length <= MAX_CHUNK_CHARS * 1.1,
      `${c.id} is ${c.text.length} chars, over the ${MAX_CHUNK_CHARS} cap`,
    );
  }
});

test('splitIntoChunks leaves a short section whole', () => {
  assert.deepEqual(splitIntoChunks('One short section.'), ['One short section.']);
  assert.deepEqual(splitIntoChunks('   '), []);
});

test('splitIntoChunks breaks a long section on sentence boundaries with overlap', () => {
  const sentence = 'Radhiant runs seven mobile imaging trucks across the country. ';
  const long = sentence.repeat(60); // well over the cap, one single line
  const pieces = splitIntoChunks(long, 400, 100);

  assert.ok(pieces.length > 1, 'expected the section to be split');
  for (const p of pieces) {
    assert.ok(p.length <= 400 + 60, `piece of ${p.length} chars exceeds the cap`);
  }
  // Sentence boundaries: no piece starts mid-sentence.
  for (const p of pieces) {
    assert.ok(/^[A-Z]/.test(p), `piece starts mid-sentence: ${p.slice(0, 40)}`);
  }
  // Overlap: consecutive pieces share text.
  const first = pieces[0];
  const second = pieces[1];
  assert.ok(second.length > 0 && first.includes(second.split('.')[0]), 'expected the tail to carry over');
});

test('splitIntoChunks keeps markdown line structure whole', () => {
  const rows = Array.from({ length: 40 }, (_, i) => `| Truck ${i} | Base ${i} | Driver ${i} |`).join('\n');
  const pieces = splitIntoChunks(rows, 300, 60);
  assert.ok(pieces.length > 1);
  for (const p of pieces) {
    for (const line of p.split('\n')) {
      assert.ok(line.startsWith('| Truck '), `a table row was cut in half: ${line}`);
    }
  }
});

test('the overlap constant stays a small fraction of the chunk size', () => {
  assert.ok(CHUNK_OVERLAP_CHARS > 0 && CHUNK_OVERLAP_CHARS < MAX_CHUNK_CHARS / 4);
});
