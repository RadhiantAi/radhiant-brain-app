import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import Md from '@/components/Md';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import { getDoc, ageInDays, isStale, STALE_AFTER_DAYS } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export default async function KnowledgeDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requireSession();
  const { slug } = await params;
  const doc = getDoc(session.role, slug);
  if (!doc) notFound();

  return (
    <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
      <div className="max-w-3xl mx-auto px-8 py-8">
        <Link href="/knowledge" className="text-sm text-ember-600 hover:underline">
          ← All knowledge
        </Link>

        <h1 className="text-2xl font-bold text-night mt-3">{doc.title}</h1>

        <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
          <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
            {doc.category}
          </span>
          <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
            Audience: {doc.audience}
          </span>
          <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
            {doc.sensitivity}
          </span>
          <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
            {doc.currentness}
          </span>
          {doc.updated && (
            <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
              Updated {doc.updated}
            </span>
          )}
          {doc.lastReviewedAt && (
            <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
              Reviewed {doc.lastReviewedAt} ({ageInDays(doc.lastReviewedAt)} days ago)
            </span>
          )}
          {doc.reviewBy && (
            <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
              Review by {doc.reviewBy}
            </span>
          )}
          {doc.owner && (
            <span className="bg-night-50 border border-night-100 rounded-full px-2.5 py-0.5 text-night-700">
              Owner: {doc.owner}
            </span>
          )}
        </div>

        {isStale(doc.lastReviewedAt) && (
          <p className="mt-4 text-[12px] bg-ember/10 text-ember-600 border border-ember/20 rounded-xl px-4 py-2.5">
            This entry has not been reviewed for over {STALE_AFTER_DAYS} days
            {doc.reviewBy ? ` (review due ${doc.reviewBy})` : ''}. Check it with{' '}
            {doc.owner || 'its owner'} before relying on anything time-sensitive in it.
          </p>
        )}

        <div className="bg-white border border-night-100 rounded-xl p-6 mt-5">
          <Md>{doc.content}</Md>
        </div>

        {doc.sources.length > 0 && (
          <div className="mt-4 text-[12px] text-night-700/70">
            <span className="font-medium">Sources: </span>
            {doc.sources.join(' · ')}
          </div>
        )}
      </div>
    </AppShell>
  );
}
