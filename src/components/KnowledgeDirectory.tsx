import Link from 'next/link';
import AppShell from './AppShell';
import Md from './Md';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import { getDoc } from '@/lib/knowledge';

/** Directories share the governed entry; no separately maintained staff JSON. */
export default async function KnowledgeDirectory({ title, slug }: { title: string; slug: string }) {
  const session = await requireSession();
  const doc = getDoc(session.role, slug);
  return <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      {doc ? <>
        <p className="text-sm text-night-700 my-4">Reviewed {doc.lastReviewedAt}. <Link href={`/knowledge/${doc.slug}`} className="underline">View entry and sources</Link></p>
        <div className="bg-white p-5 rounded-xl border border-night-100"><Md>{doc.content}</Md></div>
      </> : <p className="mt-4 text-night-700">This directory is awaiting a current, approved entry. Ask your manager to help confirm the right person or system.</p>}
    </div>
  </AppShell>;
}
