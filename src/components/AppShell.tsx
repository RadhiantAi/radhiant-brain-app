'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/chat', label: 'Ask the Brain', icon: '✦' },
  { href: '/knowledge', label: 'Knowledge', icon: '▤' },
  { href: '/people', label: 'People', icon: '☺' },
  { href: '/systems', label: 'Systems', icon: '⚙' },
  { href: '/glossary', label: 'Glossary', icon: 'Aa' },
  { href: '/admin', label: 'Admin', icon: '⛭' },
];

export default function AppShell({
  userName,
  roleLabel,
  children,
}: {
  userName: string;
  roleLabel: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signoutError, setSignoutError] = useState('');

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Sign out failed');
    } catch { setSignoutError('Sign out failed. Please try again.'); return; }
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex flex-col md:flex-row min-h-dvh">
      <header className="md:hidden h-14 bg-night text-white flex items-center justify-between px-4">
        <Link href="/" className="font-bold">Radhiant Brain</Link>
        <button aria-controls="main-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? 'Close menu' : 'Menu'}</button>
      </header>
      <aside id="main-navigation" className={`${menuOpen ? 'flex' : 'hidden'} md:flex absolute top-14 bottom-0 z-20 md:static w-60 shrink-0 bg-night text-white flex-col`}>
        <div className="px-5 py-5 border-b border-night-700">
          <Link href="/" className="block">
            <div className="text-xl font-bold tracking-tight">
              Radhiant <span className="text-ember">Brain</span>
            </div>
            <div className="text-[11px] text-night-100/70 mt-0.5">Help with the work in front of you</div>
          </Link>
        </div>
        <nav aria-label="Main navigation" className="flex-1 py-3">
          {NAV.filter(item => item.href !== '/admin' || roleLabel !== 'Team').map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  active ? 'bg-ember text-white font-medium' : 'text-night-100 hover:bg-night-800'
                }`}
              >
                <span className="w-5 text-center opacity-80">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-night-700 text-xs">
          <div className="font-medium text-white">{userName}</div>
          <div className="text-night-100/70 mb-2">{roleLabel} access</div>
          <button onClick={logout} className="text-night-100 underline underline-offset-2 hover:text-white">
            Sign out
          </button>
          {signoutError && <p role="alert">{signoutError}</p>}
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
