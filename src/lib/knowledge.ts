import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { Role, canSee } from './auth';
import { knowledgeIssue, validDate } from './knowledge-policy';

export interface KnowledgeDoc {
  brainEntryId: string;
  visibleInPortal: boolean;
  doNotRetrieveContext: boolean;
  slug: string;
  title: string;
  category: string;
  audience: Role;
  sensitivity: 'Public' | 'Internal' | 'Confidential';
  currentness: 'current' | 'historical' | 'draft';
  updated: string;
  /** Portal export contract field: the date the owner last checked this entry. */
  lastReviewedAt: string;
  /** Who answers for this entry being right. */
  owner: string;
  /** Portal export contract field. */
  approvedBy: string;
  /** Portal export contract field. */
  reviewStatus: string;
  /** Review-due date. The contract's `expiresAt` with `expiryAction: review`. */
  reviewBy: string;
  /** Portal export contract field. */
  expiryAction: string;
  sources: string[];
  summary: string;
  content: string;
}

export interface KnowledgeChunk {
  id: string;
  docSlug: string;
  docTitle: string;
  heading: string;
  text: string;
  audience: Role;
  /** Carried onto the chunk so retrieval can state an entry's age. */
  lastReviewedAt: string;
}

function knowledgeDir(): string {
  return process.env.RB_KNOWLEDGE_DIR || path.join(process.cwd(), 'knowledge');
}

// Retrieval chunking. Sections are split to roughly this size on sentence
// boundaries with a small overlap, so one long section cannot eat a seventh of
// the chat context budget and crowd out a better match.
export const MAX_CHUNK_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 150;

// An entry older than this must be cited with its date and a caution.
export const STALE_AFTER_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between an absolute YYYY-MM-DD date and now. -1 when unparseable. */
export function ageInDays(iso: string, now: Date = new Date()): number {
  if (!validDate(iso)) return -1;
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(then)) return -1;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((today - then) / MS_PER_DAY));
}

export function isStale(iso: string, now: Date = new Date()): boolean {
  const age = ageInDays(iso, now);
  // An unparseable or missing date is treated as stale: an entry that cannot
  // prove it is fresh should be cited with a caution, not with confidence.
  return age < 0 || age > STALE_AFTER_DAYS;
}

// Split a section into retrieval-sized pieces on sentence boundaries.
//
// Markdown line structure is respected first (so list items, table rows and
// headings stay whole), then long lines are broken after sentence-ending
// punctuation. Each piece after the first repeats the tail of the previous one
// so a fact spanning a boundary is still retrievable from either side.
export function splitIntoChunks(
  text: string,
  maxChars: number = MAX_CHUNK_CHARS,
  overlapChars: number = CHUNK_OVERLAP_CHARS,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];

  const segments: string[] = [];
  for (const line of trimmed.split('\n')) {
    if (line.length <= maxChars) {
      segments.push(line);
      continue;
    }
    // Break a very long line after sentence-ending punctuation. The lookbehind
    // keeps the punctuation with the sentence it closes.
    let buffer = '';
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      if (buffer && buffer.length + 1 + sentence.length > maxChars) {
        segments.push(buffer);
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer) segments.push(buffer);
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;

  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined) chunks.push(joined);
  };

  for (const segment of segments) {
    const cost = segment.length + 1;
    if (length > 0 && length + cost > maxChars) {
      flush();
      // Carry the tail of the finished chunk into the next one as overlap.
      const overlap: string[] = [];
      let overlapLength = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const next = current[i].length + 1;
        if (overlapLength + next > overlapChars) break;
        overlap.unshift(current[i]);
        overlapLength += next;
      }
      current = overlap;
      length = overlapLength;
    }
    current.push(segment);
    length += cost;
  }
  flush();

  return chunks.filter((c) => c.length > 0);
}

let cache: { docs: KnowledgeDoc[]; chunks: KnowledgeChunk[]; mtime: number } | null = null;

function dirSignature(): number {
  const KNOWLEDGE_DIR = knowledgeDir();
  try {
    const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
    return files.reduce((acc, f) => {
      const st = fs.statSync(path.join(KNOWLEDGE_DIR, f));
      return acc + st.mtimeMs + st.size;
    }, files.length);
  } catch {
    return -1;
  }
}

// Content signature for the knowledge dir (file count + mtimes). Exposed so the
// search index cache can invalidate on the same signal this module uses, instead
// of only on chunk-count changes.
export function knowledgeSignature(): number {
  return dirSignature();
}

// gray-matter returns a Date for an unquoted YAML date and a string for a
// quoted one. Normalise both to an absolute YYYY-MM-DD string.
function asIsoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function loadAll(): { docs: KnowledgeDoc[]; chunks: KnowledgeChunk[] } {
  const KNOWLEDGE_DIR = knowledgeDir();
  const sig = dirSignature();
  if (cache && cache.mtime === sig) return cache;

  const docs: KnowledgeDoc[] = [];
  const chunks: KnowledgeChunk[] = [];

  let files: string[] = [];
  try {
    files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    files = [];
  }

  for (const file of files.sort()) {
    const raw = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), 'utf-8');
    let parsed: ReturnType<typeof matter>;
    try { parsed = matter(raw); } catch { continue; }
    const { data, content } = parsed;
    const slug = file.replace(/\.md$/, '');
    // Fail closed: a typo or missing audience must NOT publish a confidential
    // file to the whole team. Anything not exactly one of the three known tiers
    // is treated as CEO-only (the most restrictive tier), and flagged loudly so
    // the misconfiguration gets noticed. CI (scripts/validate-knowledge.mjs)
    // rejects such files before they ship.
    const isKnownAudience = ['team', 'leadership', 'ceo'].includes(data.audience);
    if (!isKnownAudience) {
      console.error('[knowledge] Invalid audience; entry excluded.');
      continue;
    }
    const audience = (isKnownAudience ? data.audience : 'ceo') as Role;

    const updated = asIsoDate(data.updated);
    const doc: KnowledgeDoc = {
      brainEntryId: String(data.brainEntryId || ''),
      visibleInPortal: data.visibleInPortal === true,
      doNotRetrieveContext: data.doNotRetrieveContext !== false,
      slug,
      title: typeof data.title === 'string' ? data.title : slug,
      category: typeof data.category === 'string' ? data.category : 'General',
      audience,
      sensitivity: data.sensitivity ?? 'Internal',
      currentness: data.currentness ?? 'draft',
      updated,
      // Fall back to `updated` so an entry that predates the governance
      // front-matter still reports an age rather than reporting none.
      lastReviewedAt: asIsoDate(data.lastReviewedAt) || updated,
      owner: data.owner ? String(data.owner) : '',
      approvedBy: data.approvedBy ? String(data.approvedBy) : '',
      reviewStatus: data.reviewStatus ? String(data.reviewStatus) : '',
      reviewBy: asIsoDate(data.review_by),
      expiryAction: data.expiryAction ? String(data.expiryAction) : '',
      sources: Array.isArray(data.sources) ? data.sources.map(String) : [],
      summary: typeof data.summary === 'string' ? data.summary : '',
      content: content.trim(),
    };
    docs.push(doc);

    // Chunk by H2 for retrieval, then cap each section at MAX_CHUNK_CHARS. The
    // intro (before the first H2) is its own section.
    const parts = doc.content.split(/^## /m);
    parts.forEach((part, i) => {
      const text = (i === 0 ? part : '## ' + part).trim();
      if (!text) return;
      const headingMatch = i === 0 ? null : part.split('\n', 1)[0];
      const heading = headingMatch?.trim() || doc.title;
      splitIntoChunks(text).forEach((piece, j) => {
        chunks.push({
          id: `${slug}#${i}.${j}`,
          docSlug: slug,
          docTitle: doc.title,
          heading,
          text: piece,
          audience,
          lastReviewedAt: doc.lastReviewedAt,
        });
      });
    });
  }

  cache = { docs, chunks, mtime: sig };
  return cache;
}

export function getDocs(role: Role): KnowledgeDoc[] {
  return loadAll().docs.filter((d) => canSee(role, d.audience) && !knowledgeIssue(d));
}

export function getDoc(role: Role, slug: string): KnowledgeDoc | null {
  const doc = loadAll().docs.find((d) => d.slug === slug);
  if (!doc || !canSee(role, doc.audience) || knowledgeIssue(doc)) return null;
  return doc;
}

export function getChunks(role: Role): KnowledgeChunk[] {
  const allowed = new Set(getDocs(role).map(d => d.slug));
  return loadAll().chunks.filter(c => allowed.has(c.docSlug));
}

/** Admin metadata only. Does not expose withheld content or higher-tier titles. */
export function knowledgeReadiness(role: Role) {
  return loadAll().docs.filter(d => canSee(role, d.audience)).map(d => ({
    slug: d.slug, title: d.title, owner: d.owner, reviewBy: d.reviewBy,
    issue: knowledgeIssue(d),
  }));
}

export function getCategories(role: Role): string[] {
  return [...new Set(getDocs(role).map((d) => d.category))];
}
