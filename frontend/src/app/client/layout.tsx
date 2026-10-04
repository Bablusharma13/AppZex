'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';

/**
 * Client portal route group.
 *
 * Restricted to the CLIENT role. Agency staff are redirected to their own home;
 * the backend independently scopes every client endpoint to the caller's own
 * `clientId`, so a client cannot reach another company by editing a URL.
 */
export default function ClientLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <RouteGuard allowedRoles={['CLIENT']} loginPath="/client/login">
      <AppShell portalName="Client portal">{children}</AppShell>
    </RouteGuard>
  );
}