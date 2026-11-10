// Answer instrumentation and token accounting for the chat endpoint.
//
// The rollout signal that matters most is the list of questions the knowledge
// base cannot answer, and before this it was discarded on every request. So we
// record, per chat request: the access tier, how many chunks were retrieved,
// the top score, and which doc slugs came back. Zero-hit requests are counted
// explicitly, because that count is the content backlog.
//
// What is deliberately NOT recorded: the question, the answer, the user's name,
// or anything derived from message text. Everything here is aggregate or a doc
// slug. That keeps the POPIA posture the system prompt states, and it means the
// log can be read by whoever runs the rollout without a privacy conversation.
//
// Counters are process-local, so they are a floor on spend rather than a
// billing record; the authority stays the Anthropic console. They exist so
// monthly spend is knowable from the app's own side and so a runaway session is
// visible without waiting for an invoice.

import { Role } from './auth';

export type ChatMode = 'ai' | 'search';

export interface RetrievalRecord {
  tier: Role;
  mode: ChatMode;
  hitCount: number;
  topScore: number;
  staleCount: number;
  docSlugs: string[];
}

export interface TokenRecord {
  tier: Role;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface Counters {
  month: string;
  requests: number;
  zeroHitRequests: number;
  inputTokens: number;
  outputTokens: number;
  byTier: Record<string, { requests: number; zeroHit: number; inputTokens: number; outputTokens: number }>;
}

function emptyCounters(month: string): Counters {
  return { month, requests: 0, zeroHitRequests: 0, inputTokens: 0, outputTokens: 0, byTier: {} };
}

let counters: Counters = emptyCounters(currentMonth());

function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function tierBucket(tier: Role) {
  counters.byTier[tier] ??= { requests: 0, zeroHit: 0, inputTokens: 0, outputTokens: 0 };
  return counters.byTier[tier];
}

function rollMonth(now: Date) {
  const month = currentMonth(now);
  if (counters.month !== month) counters = emptyCounters(month);
}

/** One line per chat request. No message body, ever. */
export function recordRetrieval(record: RetrievalRecord, now: Date = new Date()): void {
  rollMonth(now);
  counters.requests += 1;
  const tier = tierBucket(record.tier);
  tier.requests += 1;
  if (record.hitCount === 0) {
    counters.zeroHitRequests += 1;
    tier.zeroHit += 1;
  }

  console.info(
    JSON.stringify({
      event: 'chat_request',
      tier: record.tier,
      mode: record.mode,
      hits: record.hitCount,
      topScore: Number(record.topScore.toFixed(3)),
      staleHits: record.staleCount,
      docs: record.docSlugs,
      zeroHit: record.hitCount === 0,
      at: now.toISOString(),
    }),
  );
}

/** Token usage from the SDK's final message, so monthly spend is knowable. */
export function recordTokenUsage(record: TokenRecord, now: Date = new Date()): void {
  rollMonth(now);
  counters.inputTokens += record.inputTokens;
  counters.outputTokens += record.outputTokens;
  const tier = tierBucket(record.tier);
  tier.inputTokens += record.inputTokens;
  tier.outputTokens += record.outputTokens;

  console.info(
    JSON.stringify({
      event: 'chat_tokens',
      tier: record.tier,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      monthInputTokens: counters.inputTokens,
      monthOutputTokens: counters.outputTokens,
      month: counters.month,
      at: now.toISOString(),
    }),
  );
}

/** Aggregate snapshot for the admin surface. Never contains message text. */
export function usageSnapshot(): Counters {
  return JSON.parse(JSON.stringify(counters)) as Counters;
}

/** Test helper. */
export function __resetUsage(now: Date = new Date()): void {
  counters = emptyCounters(currentMonth(now));
}
