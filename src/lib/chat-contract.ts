import type { ChatMessage } from './retrieval';

export interface SourceRef {
  id: string;
  slug: string;
  title: string;
  section: string;
  reviewed: string;
}
export type ChatEvent =
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'text'; text: string }
  | { type: 'done'; cited: string[]; incomplete?: boolean }
  | { type: 'error'; message: string };

export function parseMessages(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== 'object' || !('messages' in body) || !Array.isArray(body.messages)) return null;
  if (body.messages.length < 1 || body.messages.length > 20) return null;
  const messages: ChatMessage[] = [];
  let total = 0;
  for (const m of body.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
    if (!m.content.trim() || m.content.length > 8000) return null;
    total += m.content.length;
    if (total > 60000) return null;
    messages.push({ role: m.role, content: m.content });
  }
  return messages.at(-1)?.role === 'user' ? messages : null;
}
export function citedSources(answer: string, sources: SourceRef[]): SourceRef[] {
  const ids = new Set([...answer.matchAll(/\[(S\d+)\]/g)].map(m => m[1]));
  return sources.filter(s => ids.has(s.id));
}
export function linkCitations(answer: string, sources: SourceRef[]): string {
  const byId = new Map(sources.map(s => [s.id, s]));
  return answer.replace(/\[(S\d+)\]/g, (_, id: string) => {
    const source = byId.get(id);
    return source ? `[${id}](/knowledge/${encodeURIComponent(source.slug)})` : '[source unavailable]';
  });
}
/** EOF without a terminal event is an interrupted answer, even on HTTP 200. */
export async function readChatEvents(body: ReadableStream<Uint8Array>, onEvent: (event: ChatEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal = false;
  function line(value: string) {
    if (!value.trim()) return;
    const event = JSON.parse(value) as ChatEvent;
    if (!['sources', 'text', 'done', 'error'].includes(event.type)) throw new Error('Invalid response');
    if (terminal) throw new Error('Response continued after completion');
    if (event.type === 'done' || event.type === 'error') terminal = true;
    onEvent(event);
  }
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 100000) throw new Error('Response too large');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(line);
      if (done) break;
    }
    if (buffer.trim()) line(buffer);
    if (!terminal) throw new Error('Response interrupted');
  } finally { reader.releaseLock(); }
}
