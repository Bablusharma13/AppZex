'use client';

import { AdminShell } from '@/components/admin-shell';
import { RouteGuard } from '@/components/route-guard';

/**
 * Super admin route group.
 *
 * The guard only redirects; it grants nothing. Every `/api/admin/*` endpoint
 * independently re-checks the SUPER_ADMIN role and derives the tenant from a
 * database-verified support session.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <RouteGuard allowedRoles={['SUPER_ADMIN']} loginPath="/admin/login">
      <AdminShell>{children}</AdminShell>
    </RouteGuard>
  );
}