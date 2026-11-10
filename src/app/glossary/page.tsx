import AppShell from '@/components/AppShell';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import glossaryData from '@/data/glossary.json';

export const dynamic = 'force-dynamic';

export default async function GlossaryPage() {
  const session = await requireSession();

  return (
    <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
        <h1 className="text-2xl font-bold text-night">Glossary</h1>
        <p className="text-sm text-night-700 mt-1">
          Common abbreviations. Check the approved People, Systems and Knowledge entries for current company details.
        </p>

        {glossaryData.sections.map((section) => (
          <div key={section.name} className="mt-8">
            <h2 className="font-semibold text-night mb-3">{section.name}</h2>
            <div className="bg-white border border-night-100 rounded-xl divide-y divide-night-100">
              {section.entries.map((e) => (
                <div key={e.term} className="px-4 py-2.5 flex flex-col sm:flex-row gap-1 sm:gap-4">
                  <div className="w-32 shrink-0 font-medium text-night text-sm">{e.term}</div>
                  <div className="text-sm text-night-700">{e.meaning}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
