import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import { getDocs, ageInDays, isStale, STALE_AFTER_DAYS } from '@/lib/knowledge';
import { searchKnowledge } from '@/lib/search';

export const dynamic = 'force-dynamic';

const AUDIENCE_BADGE: Record<string, string> = {
  team: 'bg-verse/10 text-verse',
  leadership: 'bg-plum/10 text-plum',
  ceo: 'bg-ember/10 text-ember-600',
};

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireSession();
  const { q } = await searchParams;
  const docs = getDocs(session.role);
  const categories = [...new Set(docs.map((d) => d.category))];
  const hits = q ? searchKnowledge(session.role, q, 12) : [];

  return (
    <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
      <div className="max-w-4xl mx-auto px-8 py-8">
        <h1 className="text-2xl font-bold text-night">Knowledge</h1>
        <p className="text-sm text-night-700 mt-1">
          Approved, current entries available to you. Entries show their audience tier, last update and
          sources.
        </p>

        <form className="mt-5">
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search the knowledge base…"
            className="w-full border border-night-100 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ember/50"
          />
        </form>

        {docs.length === 0 && <p className="mt-6 text-sm text-night-700">No current, approved entries are available yet. The knowledge is being reviewed. Ask your manager to help confirm any company instruction.</p>}

        {q && (
          <div className="mt-6">
            <h2 className="font-semibold text-night text-sm mb-3">
              {hits.length} result{hits.length === 1 ? '' : 's'} for “{q}”
            </h2>
            <div className="space-y-3">
              {hits.map((h) => (
                <Link
                  key={h.chunk.id}
                  href={`/knowledge/${h.chunk.docSlug}`}
                  className="block bg-white border border-night-100 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="font-medium text-night">
                    {h.chunk.docTitle} <span className="text-night-700/60 font-normal">· {h.chunk.heading}</span>
                  </div>
                  <p className="text-sm text-night-700 mt-1 line-clamp-2">
                    {h.chunk.text.replace(/^#+ .*$/gm, '').replace(/[*_`|]/g, '').trim().slice(0, 220)}…
                  </p>
                </Link>
              ))}
              {hits.length === 0 && <p className="text-sm text-night-700">Nothing found. Try different words.</p>}
            </div>
          </div>
        )}

        {!q &&
          categories.map((cat) => (
            <div key={cat} className="mt-8">
              <h2 className="font-semibold text-night mb-3">{cat}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {docs
                  .filter((d) => d.category === cat)
                  .map((d) => (
                    <Link
                      key={d.slug}
                      href={`/knowledge/${d.slug}`}
                      className="bg-white border border-night-100 rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-night">{d.title}</div>
                        <span
                          className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${AUDIENCE_BADGE[d.audience]}`}
                        >
                          {d.audience}
                        </span>
                      </div>
                      <p className="text-sm text-night-700 mt-1 line-clamp-2">{d.summary}</p>
                      {d.lastReviewedAt && (
                        <p className="text-[11px] text-night-700/60 mt-2">
                          Reviewed {d.lastReviewedAt} ({ageInDays(d.lastReviewedAt)} days ago)
                          {isStale(d.lastReviewedAt) && (
                            <span className="ml-1.5 text-ember-600 font-medium">
                              · over {STALE_AFTER_DAYS} days, check before relying on it
                            </span>
                          )}
                        </p>
                      )}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
      </div>
    </AppShell>
  );
}
