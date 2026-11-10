import { installKnowledgeFixture } from './helpers/knowledge-fixture';
installKnowledgeFixture();

// Tier-boundary regression tests.
//
// These assert the runtime access model the app depends on: a lower-tier
// session must never be able to reach higher-tier knowledge content through any
// of the retrieval paths (browse, direct doc fetch, or search-backed chat
// context). The git repo itself has no tier boundary (see README Security), so
// this guards the one boundary that does exist: the code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getDocs, getDoc, getChunks } from '../src/lib/knowledge';
import { searchKnowledge } from '../src/lib/search';
import { canSee, ROLE_RANK } from '../src/lib/auth';

test('getDocs for a team session returns only team-audience docs', () => {
  const docs = getDocs('team');
  assert.ok(docs.length > 0, 'expected some team docs');
  for (const d of docs) assert.equal(d.audience, 'team', `${d.slug} leaked to team`);
});

test('getChunks for a team session returns only team-audience chunks', () => {
  for (const c of getChunks('team')) assert.equal(c.audience, 'team', `${c.id} leaked to team`);
});

test('a team session cannot fetch the CEO-only doc directly', () => {
  assert.ok(getDoc('ceo', 'ceo-context'), 'ceo should be able to read ceo-context');
  assert.equal(getDoc('team', 'ceo-context'), null, 'team must not read ceo-context');
  assert.equal(getDoc('leadership', 'ceo-context'), null, 'leadership must not read ceo-context');
});

test('team search never surfaces higher-tier content', () => {
  // Distinctive tokens taken from every restricted (non-team) doc; a team-role
  // search must never return those docs or any non-team chunk.
  const restricted = getDocs('ceo').filter((d) => d.audience !== 'team');
  assert.ok(restricted.length > 0, 'expected restricted (leadership/ceo) docs to exist');

  const teamSlugs = new Set(getDocs('team').map((d) => d.slug));
  for (const doc of restricted) {
    assert.ok(!teamSlugs.has(doc.slug), `${doc.slug} should not be team-visible`);
    const tokens = doc.content
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((t) => t.length > 6)
      .slice(0, 60);
    for (const token of tokens) {
      for (const h of searchKnowledge('team', token, 8)) {
        assert.notEqual(h.chunk.docSlug, doc.slug, `team search surfaced ${doc.slug} via "${token}"`);
        assert.equal(h.chunk.audience, 'team', `team search returned non-team chunk ${h.chunk.id}`);
      }
    }
  }
});

test('canSee enforces the tier ranking', () => {
  assert.equal(canSee('team', 'ceo'), false);
  assert.equal(canSee('team', 'leadership'), false);
  assert.equal(canSee('leadership', 'ceo'), false);
  assert.equal(canSee('ceo', 'team'), true);
  assert.equal(canSee('ceo', 'leadership'), true);
  assert.ok(ROLE_RANK.ceo > ROLE_RANK.leadership && ROLE_RANK.leadership > ROLE_RANK.team);
});
