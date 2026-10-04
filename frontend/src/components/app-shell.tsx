'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  Activity,
  Building2,
  Calendar,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Paperclip,
  Target,
  Users,
  X,
} from 'lucide-react';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { ROLE_LABELS } from '@/types/enums';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/** Navigation for agency staff and client accounts. */
function useNavigation(): NavSection[] {
  const { portal } = useSession();

  if (portal === 'client') {
    return [
      {
        title: 'My work',
        items: [
          { label: 'Dashboard', href: '/client/dashboard', icon: LayoutDashboard },
          { label: 'Projects', href: '/client/projects', icon: FolderKanban },
          { label: 'Feedback', href: '/client/feedback', icon: MessageSquare },
          { label: 'Files', href: '/client/files', icon: Paperclip },
          { label: 'Meetings', href: '/client/meetings', icon: Calendar },
        ],
      },
    ];
  }

  return [
    {
      title: 'Workspace',
      items: [
        { label: 'Dashboard', href: '/workspace', icon: LayoutDashboard },
        { label: 'Clients', href: '/workspace/clients', icon: Building2 },
        { label: 'Projects', href: '/workspace/projects', icon: FolderKanban },
      ],
    },
    {
      title: 'Delivery',
      items: [
        { label: 'Milestones', href: '/workspace/milestones', icon: Target },
        { label: 'Tasks', href: '/workspace/tasks', icon: CheckSquare },
        { label: 'Meetings', href: '/workspace/meetings', icon: Calendar },
      ],
    },
    {
      title: 'Collaboration',
      items: [
        { label: 'Feedback', href: '/workspace/feedback', icon: MessageSquare },
        { label: 'Files', href: '/workspace/files', icon: Paperclip },
        { label: 'Activity', href: '/workspace/activity', icon: Activity },
      ],
    },
    {
      title: 'Organisation',
      items: [{ label: 'Team', href: '/workspace/team', icon: Users }],
    },
  ];
}
export interface AppShellProps {
  children: ReactNode;
  /** Portal label shown in the sidebar header. */
  portalName: string;
}

/**
 * Shared application shell: sidebar, header and the sign-out control.
 *
 * The sidebar collapses into an off-canvas drawer below the `lg` breakpoint so
 * the same component serves desktop and mobile without a second layout.
 */
export function AppShell({ children, portalName }: AppShellProps): JSX.Element {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const sections = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Exact match for index routes so `/workspace` is not highlighted on every
  // nested page; prefix match for the rest.
  const isActive = (href: string): boolean =>
    href === '/workspace' || href === '/client/dashboard'
      ? pathname === href
      : pathname.startsWith(href);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-border px-5">
        <div>
          <p className="text-sm font-semibold text-foreground">AppZex</p>
          <p className="text-xs text-muted-foreground">{portalName}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors',
                        active
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {user ? (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start"
            onClick={() => void logout()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {isMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-64 border-r border-border bg-card">
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="absolute right-3 top-4 rounded p-1 text-muted-foreground"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold">{portalName}</span>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}