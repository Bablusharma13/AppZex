import type { Metadata } from 'next';

import { SessionProvider } from '@/hooks/use-session';
import { ToastProvider } from '@/hooks/use-toast';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AppZex AgencyOS',
    template: '%s · AppZex AgencyOS',
  },
  description:
    'Multi-tenant project management for agencies: clients, projects, milestones, tasks, meetings and client feedback.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/*
          Providers live above the router so a session can be restored on any
          page, including the public landing page.
        */}
        <SessionProvider>
          <ToastProvider>{children}</ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}