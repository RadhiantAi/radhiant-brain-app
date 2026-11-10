// Release gate. Uses the same policy as browse, direct lookup and chat.
// Approval and dates must come from the governed source, never a build override.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { knowledgeIssue } from '../src/lib/knowledge-policy.ts';

const dir = process.env.RB_KNOWLEDGE_DIR || path.join(process.cwd(), 'knowledge');
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.trim() : '';
let files;
try { files = fs.readdirSync(dir).filter(f => f.endsWith('.md')); }
catch { console.error('Cannot read knowledge directory. Release blocked.'); process.exit(1); }
const errors = [];
const ids = new Set();
if (!files.length) errors.push('No approved knowledge has been imported.');
for (const file of files.sort()) {
  try {
    const { data, content } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
    const doc = {
      brainEntryId: String(data.brainEntryId || ''), audience: String(data.audience || ''),
      currentness: String(data.currentness || ''), reviewStatus: String(data.reviewStatus || ''),
      approvedBy: String(data.approvedBy || ''), owner: String(data.owner || ''),
      lastReviewedAt: date(data.lastReviewedAt), reviewBy: date(data.review_by),
      expiryAction: String(data.expiryAction || ''), sources: Array.isArray(data.sources) ? data.sources.map(String) : [],
      visibleInPortal: data.visibleInPortal === true, doNotRetrieveContext: data.doNotRetrieveContext !== false,
    };
    const issue = knowledgeIssue(doc);
    if (issue) errors.push(`${file}: ${issue}`);
    if (typeof data.title !== 'string' || !data.title.trim() || !content.trim()) errors.push(`${file}: missing title or content`);
    if (!['Public', 'Internal', 'Confidential'].includes(data.sensitivity)) errors.push(`${file}: invalid sensitivity`);
    if (ids.has(doc.brainEntryId) && doc.brainEntryId) errors.push(`${file}: duplicate governed entry ID`);
    ids.add(doc.brainEntryId);
  } catch { errors.push(`${file}: invalid front-matter`); }
}
if (errors.length) {
  console.error(`Knowledge release blocked (${errors.length}):\n${errors.map(e => `  - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`Knowledge release gate passed: ${files.length} current, approved entries.`);
