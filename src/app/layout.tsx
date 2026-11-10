import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Radhiant Brain',
  description: 'The one place Radhiant context lives. Internal knowledge assistant for the Radhiant team.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
