import AppShell from '@/components/AppShell';
import ChatClient from '@/components/ChatClient';
import { requireSession } from '@/lib/session-server';
import { ROLE_LABEL } from '@/lib/auth';
import { anthropicConfigured } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const session = await requireSession();
  return (
    <AppShell userName={session.name} roleLabel={ROLE_LABEL[session.role]}>
      <ChatClient aiOn={anthropicConfigured()} />
    </AppShell>
  );
}
