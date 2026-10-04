'use client';

import { AppShell } from '@/components/app-shell';
import { RouteGuard } from '@/components/route-guard';

/**
 * Agency workspace route group.
 *
 * Clients are excluded here *and* by the backend: `/api/workspace/*` and
 * `/api/collab/*` reject the CLIENT role outright, so the redirect below is a
 * usability measure rather than the security boundary.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <RouteGuard allowedRoles={['AGENCY_ADMIN', 'AGENCY_TEAM']} loginPath="/login">
      <AppShell portalName="Agency workspace">{children}</AppShell>
    </RouteGuard>
  );
}