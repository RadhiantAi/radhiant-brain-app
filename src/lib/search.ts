import MiniSearch from 'minisearch';
import { Role } from './auth';
import { getChunks, knowledgeSignature, KnowledgeChunk } from './knowledge';

export interface SearchHit {
  chunk: KnowledgeChunk;
  score: number;
}

// One index per role tier keeps access filtering airtight: a team user's
// query never touches leadership or CEO content at all.
const indexes = new Map<string, { index: MiniSearch; byId: Map<string, KnowledgeChunk>; sig: string }>();

function getIndex(role: Role) {
  const chunks = getChunks(role);
  const key = role;
  // Invalidate on the same content signature knowledge.ts uses. Keying on chunk
  // count alone missed edits that changed a file's text without changing its H2
  // section count, leaving the index (and the chat context) serving stale text.
  // Re-evaluate eligibility on every request, including after midnight or a
  // withdrawal. A warm index must never keep an expired entry searchable.
  const sig = `${knowledgeSignature()}:${chunks.map(c => c.id).join('|')}`;
  const existing = indexes.get(key);
  if (existing && existing.sig === sig) return existing;

  const index = new MiniSearch({
    fields: ['heading', 'text', 'docTitle'],
    storeFields: [],
    searchOptions: {
      boost: { heading: 2, docTitle: 1.5 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  const byId = new Map<string, KnowledgeChunk>();
  for (const c of chunks) {
    index.add({ id: c.id, heading: c.heading, text: c.text, docTitle: c.docTitle });
    byId.set(c.id, c);
  }
  const entry = { index, byId, sig };
  indexes.set(key, entry);
  return entry;
}

export function searchKnowledge(role: Role, query: string, limit = 8): SearchHit[] {
  if (!query.trim()) return [];
  const { index, byId } = getIndex(role);
  return index
    .search(query)
    .slice(0, limit)
    .map((r) => ({ chunk: byId.get(String(r.id))!, score: r.score }))
    .filter((h) => h.chunk);
}
