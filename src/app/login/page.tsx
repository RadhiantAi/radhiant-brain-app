'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// Only allow same-origin relative paths (a single leading slash, not "//host"),
// so a crafted ?next= cannot bounce a just-signed-in user to an external site.
function safeNext(next: string | null): string {
  if (next && /^\/(?!\/)/.test(next)) return next;
  return '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, passcode }),
      });
      if (res.ok) {
        router.push(safeNext(params.get('next')));
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Sign in failed. Try again.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
      <div className="text-2xl font-bold text-night mb-1">
        Radhiant <span className="text-ember">Brain</span>
      </div>
      <p className="text-sm text-night-700 mb-6">The one place Radhiant context lives. Sign in with your name and your group&apos;s passcode.</p>

      <label className="block text-sm font-medium text-night mb-1">Your name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border border-night-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-ember/50"
        placeholder="e.g. Sam le Roux"
        autoFocus
      />

      <label className="block text-sm font-medium text-night mb-1">Passcode</label>
      <input
        type="password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        className="w-full border border-night-100 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-ember/50"
        placeholder="Team, leadership, or CEO passcode"
      />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        disabled={busy}
        className="w-full bg-ember hover:bg-ember-600 text-white font-medium rounded-lg py-2.5 transition-colors disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-[11px] text-night-700/70 mt-5">
        Internal tool. Confidential. Never paste patient information into this app.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-night flex items-center justify-center p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
