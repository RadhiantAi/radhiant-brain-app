// Retrieval query building and context assembly for the chat endpoint.
//
// Kept out of the route handler so it can be tested directly, and so the
// staleness rule that governs how an entry is cited lives next to the code that
// decides which entries get cited at all.

import { SearchHit } from './search';
import { MAX_CHUNK_CHARS, STALE_AFTER_DAYS, ageInDays, isStale } from './knowledge';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Total characters of knowledge context sent with a chat request.
export const CONTEXT_BUDGET_CHARS = 18000;

// How much of the previous user turn to carry into the retrieval query.
const PRIOR_TURN_CHARS = 300;

// Build the retrieval query from the last user message plus the previous user
// turn. A follow-up like "and who does she report to?" carries no entity of its
// own, so on the last message alone it retrieves nothing useful. The prior turn
// is truncated and appended, not prepended, so the current question still
// dominates the lexical score.
export function buildRetrievalQuery(messages: ChatMessage[]): string {
  const userTurns = messages.filter((m) => m.role === 'user').map((m) => m.content.trim()).filter(Boolean);
  if (userTurns.length === 0) return '';
  const last = userTurns[userTurns.length - 1];
  const prior = userTurns.length > 1 ? userTurns[userTurns.length - 2] : '';
  if (!prior) return last;
  return `${last} ${prior.slice(0, PRIOR_TURN_CHARS)}`.trim();
}

/**
 * The context line for one retrieved chunk. Age is part of the citation, so an
 * entry that has not been reviewed in a while is delivered as what it is.
 */
export function contextHeaderLine(
  title: string,
  heading: string,
  lastReviewedAt: string,
  now: Date = new Date(),
): string {
  const reviewed = lastReviewedAt || 'unknown';
  const base = `[Entry: ${title} | Section: ${heading} | Last reviewed: ${reviewed}]`;
  if (!isStale(lastReviewedAt, now)) return base;
  const age = ageInDays(lastReviewedAt, now);
  const detail = age < 0 ? 'no review date recorded' : `not reviewed for ${age} days`;
  return `${base.slice(0, -1)} | STALE: ${detail}]`;
}

export interface BuiltContext {
  context: string;
  staleCount: number;
}

export function buildContext(hits: SearchHit[], now: Date = new Date()): BuiltContext {
  let staleCount = 0;
  const blocks = hits.map((h) => {
    if (isStale(h.chunk.lastReviewedAt, now)) staleCount += 1;
    const header = contextHeaderLine(h.chunk.docTitle, h.chunk.heading, h.chunk.lastReviewedAt, now);
    return `${header}\n${h.chunk.text.slice(0, MAX_CHUNK_CHARS)}`;
  });
  return { context: blocks.join('\n\n---\n\n').slice(0, CONTEXT_BUDGET_CHARS), staleCount };
}

// The grounding rule the system prompt carries about entry age.
export const FRESHNESS_RULE =
  `- Every context entry carries a "Last reviewed" date. When an entry is older than ${STALE_AFTER_DAYS} days ` +
  `(it will be marked STALE), you must cite it with its date and add a short caution that it may have moved on, ` +
  `for example "per the Fleet and daily operations entry, last reviewed 5 July 2026, which may be out of date". ` +
  `Never present a stale entry as the current position without that caution.`;
