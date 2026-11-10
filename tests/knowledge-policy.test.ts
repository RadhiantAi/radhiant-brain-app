import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { knowledgeIssue, validDate, type KnowledgePolicy } from '../src/lib/knowledge-policy';
import { getDoc, getDocs, getChunks } from '../src/lib/knowledge';
import { searchKnowledge } from '../src/lib/search';
import { installKnowledgeFixture } from './helpers/knowledge-fixture';

const now = new Date('2026-11-09T12:00:00Z');
const approved: KnowledgePolicy = {
  brainEntryId: 'RB-MEM-20261109-0001', audience: 'team', currentness: 'current', reviewStatus: 'approved',
  approvedBy: 'Synthetic approver', owner: 'Synthetic owner', lastReviewedAt: '2026-11-08', reviewBy: '2026-11-09',
  expiryAction: 'review', sources: ['Synthetic fixture'], visibleInPortal: true, doNotRetrieveContext: false,
};
test('a complete approved entry is eligible until its SAST review deadline', () => {
  assert.equal(knowledgeIssue(approved, now), null);
  assert.equal(knowledgeIssue(approved, new Date('2026-11-09T21:59:59Z')), null);
  assert.equal(knowledgeIssue(approved, new Date('2026-11-09T22:00:00Z')), 'review overdue');
});
test('missing, blocked, unapproved, historical and expired evidence all fail closed', () => {
  const cases: Partial<KnowledgePolicy>[] = [
    { brainEntryId: '' }, { audience: 'leadershp' }, { reviewStatus: 'pending-owner-confirmation' },
    { approvedBy: '' }, { sources: ['  '] }, { doNotRetrieveContext: true },
    { visibleInPortal: false }, { currentness: 'draft' }, { currentness: 'historical' },
    { reviewBy: '2026-11-08' }, { lastReviewedAt: '2026-11-10' }, { expiryAction: 'unknown' },
  ];
  for (const change of cases) assert.ok(knowledgeIssue({ ...approved, ...change }, now), JSON.stringify(change));
});
test('an approved entry with no named owner and no source references is still released', () => {
  assert.equal(knowledgeIssue({ ...approved, owner: '', sources: [] }, now), null);
});
test('impossible dates are rejected instead of normalised into another month', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-2-9'), false);
});
const dir = installKnowledgeFixture();
test('withdrawal removes content from a warm search index, browse and direct lookup', () => {
  assert.ok(searchKnowledge('team', 'coordinator').length);
  const file = join(dir, 'people-and-roles.md');
  const parsed = matter(readFileSync(file, 'utf8'));
  writeFileSync(file, matter.stringify(parsed.content, { ...parsed.data, doNotRetrieveContext: true }));
  assert.equal(getDoc('team', 'people-and-roles'), null);
  assert.ok(!getDocs('team').some(d => d.slug === 'people-and-roles'));
  assert.ok(!getChunks('team').some(d => d.docSlug === 'people-and-roles'));
  assert.equal(searchKnowledge('team', 'coordinator').length, 0);
});
