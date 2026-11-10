import AppShell from '@/components/AppShell';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import { getDocs, knowledgeReadiness } from '@/lib/knowledge';
import { integrationStatuses, chatModel } from '@/lib/config';
import { usingDevPasscodes, usingDevSecret } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await requireSession();

  if (session.role !== 'ceo' && session.role !== 'leadership') {
    return (
      <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
        <div className="max-w-2xl mx-auto px-8 py-16 text-center">
          <h1 className="text-xl font-bold text-night">Admin is for leadership access</h1>
          <p className="text-sm text-night-700 mt-2">
            Sign in with a leadership or CEO passcode to see configuration and the knowledge inventory.
          </p>
        </div>
      </AppShell>
    );
  }

  const statuses = integrationStatuses();
  const docs = getDocs(session.role);
  const withheld = knowledgeReadiness(session.role).filter(d => d.issue);
  const devMode = usingDevPasscodes() || usingDevSecret();

  return (
    <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
      <div className="max-w-4xl mx-auto px-8 py-8">
        <h1 className="text-2xl font-bold text-night">Admin</h1>
        <p className="text-sm text-night-700 mt-1">Configuration state, knowledge inventory and how to update content.</p>

        {devMode && (
          <div className="mt-5 bg-ember-50 border border-ember/30 rounded-xl p-4 text-sm text-night">
            <span className="font-semibold text-ember-600">Configuration incomplete.</span> Required credentials are missing. Sign-in fails closed until they are configured.
          </div>
        )}

        <h2 className="font-semibold text-night mt-8 mb-3">Integrations & environment</h2>
        <div className="bg-white border border-night-100 rounded-xl divide-y divide-night-100">
          {statuses.map((s) => (
            <div key={s.key} className="px-4 py-3 flex items-start gap-3">
              <span
                className={`mt-0.5 shrink-0 w-2.5 h-2.5 rounded-full ${
                  s.configured ? 'bg-verse' : s.required ? 'bg-ember' : 'bg-night-100'
                }`}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-night">
                  {s.label} <code className="text-[11px] text-night-700/70">({s.key})</code>
                </div>
                <p className="text-[12px] text-night-700 mt-0.5">
                  {s.configured ? 'Configured.' : s.required ? 'Not configured yet. ' + s.note : s.note}
                </p>
              </div>
            </div>
          ))}
          <div className="px-4 py-3 flex items-start gap-3">
            <span className="mt-0.5 shrink-0 w-2.5 h-2.5 rounded-full bg-night-100" />
            <div>
              <div className="text-sm font-medium text-night">Chat model</div>
              <p className="text-[12px] text-night-700 mt-0.5">
                <code>{chatModel()}</code> (override with RB_CHAT_MODEL)
              </p>
            </div>
          </div>
        </div>

        <h2 className="font-semibold text-night mt-8 mb-3">Knowledge inventory ({docs.length} entries)</h2>
        {withheld.length > 0 && <section className="bg-ember/10 rounded-xl p-4 mb-4">
          <h3 className="font-semibold">Withheld from staff answers ({withheld.length})</h3>
          <ul className="mt-2 text-sm space-y-1">{withheld.map(d => <li key={d.slug}>{d.title}: {d.issue}. Owner: {d.owner || 'unassigned'}. Review due: {d.reviewBy || 'not set'}.</li>)}</ul>
        </section>}
        <div className="bg-white border border-night-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-night-50 text-left text-night">
                <th className="px-4 py-2 font-medium">Entry</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Audience</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-100">
              {docs.map((d) => (
                <tr key={d.slug}>
                  <td className="px-4 py-2 text-night">{d.title}</td>
                  <td className="px-4 py-2 text-night-700">{d.category}</td>
                  <td className="px-4 py-2 text-night-700">{d.audience}</td>
                  <td className="px-4 py-2 text-night-700">{d.updated || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="font-semibold text-night mt-8 mb-3">How to update knowledge</h2>
        <div className="bg-white border border-night-100 rounded-xl p-5 text-sm text-night-700 space-y-2">
          <p>
            Knowledge entries are markdown files in the app&apos;s <code>knowledge/</code> folder. Each has front-matter:
            title, category, audience (team / leadership / ceo), sensitivity, updated date and sources.
          </p>
          <p>
            Edit or add a file, redeploy, and both browsing and chat pick it up. This mirrors the Radhiant Brain spec
            V0.6 model: this app is a derived read surface, and the governed Brain repo (registers, source lanes,
            approvals) remains the authority for what gets published here.
          </p>
          <p>Keep patient-level data and personal data out of knowledge entries. Aggregate business facts only.</p>
        </div>
      </div>
    </AppShell>
  );
}
