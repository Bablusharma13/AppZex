'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Activity, Building2, LayoutDashboard, LogOut, Shield } from 'lucide-react';

import { Avatar } from '@/components/avatar';
import { SupportBanner } from '@/components/support-banner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Agencies', href: '/admin/agencies', icon: Building2 },
  { label: 'Platform activity', href: '/admin/activity', icon: Activity },
];

/**
 * Shell for the super admin portal.
 *
 * Kept visually distinct from the agency workspace on purpose: an operator
 * acting outside their own tenant must always be aware of which context the
 * current screen belongs to.
 */
export function AdminShell({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const { user, logout, supportSession } = useSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-slate-900 p-1.5 text-white">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">AppZex Platform</p>
              <p className="text-xs text-muted-foreground">Super admin console</p>
            </div>
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 sm:flex">
                <Avatar name={user.name} />
                <div className="text-right">
                  <p className="text-sm font-medium leading-tight">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => void logout()}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          ) : null}
        </div>

        <nav className="border-t border-border" aria-label="Admin navigation">
          <div className="mx-auto flex max-w-7xl gap-1 px-4 sm:px-6 lg:px-8">
            {ADMIN_NAV.map((item) => {
              const active =
                item.href === '/admin/dashboard'
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors',
                    active
                      ? 'border-primary font-medium text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Visible whenever an operator is inside somebody else's tenant. */}
      <SupportBanner session={supportSession} />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}