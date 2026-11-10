import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, Session, verifySessionToken } from './auth';

export async function requireSession(): Promise<Session> {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect('/login');
  return session;
}
