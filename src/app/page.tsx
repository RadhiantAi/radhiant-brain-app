import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import { getDocs } from '@/lib/knowledge';
import { anthropicConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireSession();
  const docs = getDocs(session.role);
  const aiOn = anthropicConfigured();
  const firstName = session.name.split(' ')[0];

  const tiles = [
    {
      href: '/chat',
      title: 'Ask the Brain',
      body: aiOn
        ? 'Ask anything about Radhiant: people, meetings, SOPs, systems, strategy. Answers cite their sources.'
        : 'Search approved knowledge while chat is unavailable.',
      accent: 'bg-ember',
    },
    {
      href: '/knowledge',
      title: 'Knowledge',
      body: `${docs.length} entries you can browse: company, operations, systems, SOPs and more.`,
      accent: 'bg-teal-brand',
    },
    {
      href: '/people',
      title: 'People',
      body: 'Find the approved people and responsibilities directory.',
      accent: 'bg-verse',
    },
    {
      href: '/systems',
      title: 'Systems',
      body: 'Find the approved systems directory and help with access.',
      accent: 'bg-plum',
    },
  ];

  return (
    <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
      <div className="max-w-5xl mx-auto px-8 py-10">
        <h1 className="text-3xl font-bold text-night">Welcome, {firstName}</h1>
        <p className="text-night-700 mt-2 max-w-2xl">
          Start with a question, get help with a draft, or browse the approved knowledge available to you.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group bg-white rounded-xl border border-night-100 p-5 hover:shadow-md transition-shadow"
            >
              <div className={`w-8 h-1.5 rounded-full ${t.accent} mb-3`} />
              <div className="font-semibold text-night group-hover:text-ember-600 transition-colors">{t.title}</div>
              <p className="text-sm text-night-700 mt-1">{t.body}</p>
            </Link>
          ))}
        </div>

        <div className="mt-10 bg-night-50 border border-night-100 rounded-xl p-5">
          <div className="font-semibold text-night text-sm">House rules</div>
          <ul className="text-sm text-night-700 mt-2 space-y-1 list-disc ml-5">
            <li>Everything here is Internal or Confidential. Don&apos;t share outside Radhiant.</li>
            <li>Never paste patient information into this app. Aggregate numbers only (POPIA).</li>
            <li>Spot something stale or wrong? Tell Anith or your head of department so the entry gets corrected.</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
