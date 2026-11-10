import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import matter from 'gray-matter';

// Entirely synthetic. Does not approve or copy any business document.
export function installKnowledgeFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'rb-knowledge-test-'));
  process.env.RB_KNOWLEDGE_DIR = dir;
  const date = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const rows = [
    ['people-and-roles', 'People roles reporting', 'team', 'The fixture coordinator handles people roles and reporting questions.'],
    ['file-naming-and-sops', 'File naming SOP', 'team', 'Use the synthetic file naming checklist.'],
    ['finance', 'Fixture leadership entry', 'leadership', 'RestrictedLeadershipCanary is synthetic.'],
    ['ceo-context', 'Fixture CEO entry', 'ceo', 'RestrictedCeoCanary is synthetic.'],
  ];
  rows.forEach(([slug, title, audience, content], i) => writeFileSync(join(dir, `${slug}.md`), matter.stringify(content, {
    brainEntryId: `RB-MEM-20261109-${String(i + 1).padStart(4, '0')}`, title, category: 'Synthetic', audience,
    sensitivity: 'Internal', currentness: 'current', updated: date(-1), lastReviewedAt: date(-1),
    review_by: date(30), expiryAction: 'review', owner: 'Fixture owner', approvedBy: 'Fixture approver',
    reviewStatus: 'approved', sources: ['Synthetic test fixture'], visibleInPortal: true, doNotRetrieveContext: false,
  })));
  after(() => { delete process.env.RB_KNOWLEDGE_DIR; rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
