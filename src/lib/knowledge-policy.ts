/** Shared by the request-time reader and release validation. No model decision
 * can grant access, approve an entry, or extend its review date. */
export interface KnowledgePolicy {
  brainEntryId: string;
  audience: string;
  currentness: string;
  reviewStatus: string;
  approvedBy: string;
  owner: string;
  lastReviewedAt: string;
  reviewBy: string;
  expiryAction: string;
  sources: string[];
  visibleInPortal: boolean;
  doNotRetrieveContext: boolean;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function sastDate(now = new Date()): string {
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function knowledgeIssue(doc: KnowledgePolicy, now = new Date()): string | null {
  if (!['team', 'leadership', 'ceo'].includes(doc.audience)) return 'invalid audience';
  if (doc.reviewStatus !== 'approved') return 'awaiting approval';
  if (!doc.visibleInPortal || doc.doNotRetrieveContext) return 'withdrawn from retrieval';
  if (doc.currentness !== 'current') return 'not current';
  if (!/^RB-MEM-\d{8}-\d{4}$/.test(doc.brainEntryId)) return 'missing governed entry ID';
  // An approver is required. A named owner and source references are shown when
  // present but are not a condition of release (owner ruling, 10 November 2026):
  // the governed export does not carry an owner field.
  if (!doc.approvedBy.trim()) return 'missing approver';
  if (doc.sources.some(s => !s.trim())) return 'blank source reference';
  if (!['review', 'archive', 'retire'].includes(doc.expiryAction)) return 'unsupported expiry action';
  if (!validDate(doc.lastReviewedAt) || !validDate(doc.reviewBy)) return 'invalid review date';
  if (doc.lastReviewedAt > sastDate(now)) return 'review date is in the future';
  if (doc.reviewBy <= doc.lastReviewedAt) return 'review deadline must follow review';
  if (doc.reviewBy < sastDate(now)) return 'review overdue';
  return null;
}
