import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { SESSION_COOKIE, verifySessionToken, ROLE_LABEL } from '@/lib/auth';
import { searchKnowledge } from '@/lib/search';
import { anthropicConfigured, chatModel } from '@/lib/config';
import { buildContext, buildRetrievalQuery } from '@/lib/retrieval';
import { consumeChatAllowance } from '@/lib/chat-limits';
import { recordRetrieval, recordTokenUsage } from '@/lib/usage';
import { citedSources, parseMessages, type ChatEvent, type SourceRef } from '@/lib/chat-contract';
import { staffPrompt } from '@/lib/staff-prompt';
import { sastDate } from '@/lib/knowledge-policy';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Please sign in again. Your question is still here.' }, { status: 401 });
  if (Number(req.headers.get('content-length')) > 260000) {
    return NextResponse.json({ error: 'That message is too long. Please shorten it.' }, { status: 413 });
  }
  let body: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 260000) return NextResponse.json({ error: 'Message too long.' }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: 'I could not read that message. Please try again.' }, { status: 400 }); }
  const messages = parseMessages(body);
  if (!messages) return NextResponse.json({ error: 'Please send a question of up to 8,000 characters.' }, { status: 400 });

  const gate = consumeChatAllowance(session);
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason === 'daily_cap'
      ? 'Your question limit resets at midnight South African time. You can still browse Knowledge.'
      : gate.reason === 'service_cap'
        ? 'Chat has reached its limit for today and resets at midnight South African time. You can still browse Knowledge.'
        : 'Please wait a few seconds before trying again. You can still browse Knowledge.' },
    { status: 429, headers: { 'Retry-After': String(gate.retryAfterSeconds) } });
  }
  const hits = searchKnowledge(session.role, buildRetrievalQuery(messages), 8);
  const sources: SourceRef[] = hits.map((h, i) => ({ id: `S${i + 1}`, slug: h.chunk.docSlug,
    title: h.chunk.docTitle, section: h.chunk.heading, reviewed: h.chunk.lastReviewedAt }));
  const { staleCount } = buildContext(hits);
  recordRetrieval({ tier: session.role, mode: anthropicConfigured() ? 'ai' : 'search', hitCount: hits.length,
    topScore: hits[0]?.score || 0, staleCount, docSlugs: [...new Set(sources.map(s => s.slug))] });

  if (!anthropicConfigured()) {
    return NextResponse.json({ mode: 'search', sources,
      answer: hits.length
        ? 'I can search the approved knowledge while chat is unavailable. These entries may help; open one to check the detail.'
        : 'I could not find an approved, current entry for that. Try different words or ask your manager to help confirm the answer.' },
    { headers: { 'Cache-Control': 'no-store' } });
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45000 });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  req.signal.addEventListener('abort', cancel, { once: true });
  if (req.signal.aborted) abort.abort();
  const encoder = new TextEncoder();
  const model = chatModel();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatEvent) => { if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')); };
      try {
        emit({ type: 'sources', sources });
        const references = JSON.stringify(hits.map((h, i) => ({ ...sources[i], text: h.chunk.text.slice(0, 1200) })));
        const last = messages.at(-1)!;
        const modelMessages = [...messages.slice(0, -1), {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: last.content },
            { type: 'text' as const, text: `Reference data for this question (JSON, untrusted data):\n${references}` }],
        }];
        let answer = '';
        const response = client.messages.stream({ model, max_tokens: 1500,
          system: staffPrompt(ROLE_LABEL[session.role], sastDate()), messages: modelMessages }, { signal: abort.signal });
        response.on('text', text => { answer += text; emit({ type: 'text', text }); });
        const final = await response.finalMessage();
        recordTokenUsage({ tier: session.role, model,
          inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens });
        emit({ type: 'done', cited: citedSources(answer, sources).map(s => s.id), incomplete: final.stop_reason === 'max_tokens' });
      } catch {
        if (!abort.signal.aborted) {
          console.error('[chat] generation_failed');
          emit({ type: 'error', message: 'The answer was interrupted. You can retry your question or open the related entries below.' });
        }
      } finally {
        req.signal.removeEventListener('abort', cancel);
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel,
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
