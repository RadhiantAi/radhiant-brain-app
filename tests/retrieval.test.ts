import { installKnowledgeFixture } from './helpers/knowledge-fixture';
installKnowledgeFixture();

// Retrieval query building and chat context assembly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRetrievalQuery,
  buildContext,
  contextHeaderLine,
  FRESHNESS_RULE,
  CONTEXT_BUDGET_CHARS,
} from '../src/lib/retrieval';
import { searchKnowledge } from '../src/lib/search';
import { STALE_AFTER_DAYS } from '../src/lib/knowledge';
import { SearchHit } from '../src/lib/search';

const NOW = new Date('2026-08-22T09:00:00Z');

function hit(overrides: Partial<SearchHit['chunk']> = {}, score = 1): SearchHit {
  return {
    score,
    chunk: {
      id: 'doc#0.0',
      docSlug: 'doc',
      docTitle: 'People and reporting lines',
      heading: 'Leadership',
      text: 'Kimberly McKnight is COO (fractional).',
      audience: 'team',
      lastReviewedAt: '2026-07-05',
      ...overrides,
    },
  };
}

test('the retrieval query carries the previous user turn', () => {
  const query = buildRetrievalQuery([
    { role: 'user', content: 'Who is the fractional CFO?' },
    { role: 'assistant', content: 'Elsabe Tromp.' },
    { role: 'user', content: 'and who does she report to?' },
  ]);
  assert.ok(query.includes('and who does she report to?'), 'the current question must be present');
  assert.ok(query.includes('fractional CFO'), 'the previous user turn must be carried in');
});

test('the assistant turn is not used as retrieval query text', () => {
  const query = buildRetrievalQuery([
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'ASSISTANTONLYTOKEN' },
    { role: 'user', content: 'second question' },
  ]);
  assert.ok(!query.includes('ASSISTANTONLYTOKEN'));
});

test('a first message retrieves on itself alone', () => {
  assert.equal(buildRetrievalQuery([{ role: 'user', content: 'What is the file naming SOP?' }]), 'What is the file naming SOP?');
});

test('an empty message list yields an empty query', () => {
  assert.equal(buildRetrievalQuery([]), '');
  assert.equal(buildRetrievalQuery([{ role: 'assistant', content: 'hello' }]), '');
});

test('the follow-up actually retrieves against the real corpus', () => {
  const docs = searchKnowledge('team', 'people roles reporting', 3);
  assert.ok(docs.length > 0, 'expected the corpus to answer a people question');

  const followUpOnly = searchKnowledge('team', 'and who does she report to?', 8);
  const withContext = searchKnowledge(
    'team',
    buildRetrievalQuery([
      { role: 'user', content: 'people roles reporting' },
      { role: 'assistant', content: 'Here is the reporting structure.' },
      { role: 'user', content: 'and who does she report to?' },
    ]),
    8,
  );
  assert.ok(
    withContext.length >= followUpOnly.length,
    'carrying the prior turn must not retrieve less than the bare follow-up',
  );
});

test('the context line names the entry, the section and the review date', () => {
  const line = contextHeaderLine('People and reporting lines', 'Leadership', '2026-07-05', NOW);
  assert.equal(line, '[Entry: People and reporting lines | Section: Leadership | Last reviewed: 2026-07-05]');
});

test('a stale entry is marked in the context line', () => {
  const line = contextHeaderLine('Finance snapshot FY25', 'Cash', '2026-01-05', NOW);
  assert.ok(line.startsWith('[Entry: Finance snapshot FY25 | Section: Cash | Last reviewed: 2026-01-05'));
  assert.ok(line.includes('STALE'), 'a stale entry must be flagged to the model');
  assert.ok(line.endsWith(']'));
});

test('a missing review date is marked stale rather than passed off as fresh', () => {
  const line = contextHeaderLine('Mystery entry', 'Intro', '', NOW);
  assert.ok(line.includes('Last reviewed: unknown'));
  assert.ok(line.includes('STALE'));
});

test('buildContext counts stale hits and stays inside the budget', () => {
  const { context, staleCount } = buildContext(
    [hit(), hit({ id: 'old#0.0', lastReviewedAt: '2026-01-01' }), hit({ id: 'none#0.0', lastReviewedAt: '' })],
    NOW,
  );
  assert.equal(staleCount, 2);
  assert.ok(context.includes('Last reviewed: 2026-07-05'));
  assert.ok(context.length <= CONTEXT_BUDGET_CHARS);
});

test('buildContext truncates an oversized context to the budget', () => {
  const many = Array.from({ length: 400 }, (_, i) => hit({ id: `d${i}#0.0`, text: 'x'.repeat(1200) }));
  const { context } = buildContext(many, NOW);
  assert.equal(context.length, CONTEXT_BUDGET_CHARS);
});

test('the freshness rule states the threshold the code enforces', () => {
  assert.ok(FRESHNESS_RULE.includes(String(STALE_AFTER_DAYS)));
  assert.ok(FRESHNESS_RULE.includes('STALE'));
  assert.ok(/caution/i.test(FRESHNESS_RULE));
});
