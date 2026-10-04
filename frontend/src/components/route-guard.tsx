'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { FullPageLoader } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { ROLE_HOME, ROLE_LABELS, type Role } from '@/types/enums';

export interface RouteGuardProps {
  children: ReactNode;
  /** Roles permitted on this route. A user without one is redirected away. */
  allowedRoles: Role[];
  /** Where to send a signed-out visitor. */
  loginPath: string;
}

/**
 * Shown instead of a bare spinner when the visitor is about to be redirected.
 *
 * Without an explanation a silent redirect just looks like a page that never
 * finishes loading, so the reason and the destination are stated explicitly.
 */
function RedirectNotice({
  title,
  detail,
  href,
  actionLabel,
}: {
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}): JSX.Element {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>
        <Button className="mt-4" asChild>
          <Link href={href}>{actionLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Client-side route guard.
 *
 * This exists purely for usability: it avoids rendering a page the user cannot
 * use. It is **not** a security boundary. Every route is independently enforced
 * by the backend, which derives the tenant and role from the verified token, so
 * bypassing this component grants no access to any data.
 */
export function RouteGuard({ children, allowedRoles, loginPath }: RouteGuardProps): JSX.Element {
  const { user, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace(loginPath);
      return;
    }

    // Wrong portal (e.g. a client opening /workspace): send them to their own
    // home rather than showing a page that would only 403 on every request.
    if (!allowedRoles.includes(user.role)) {
      router.replace(ROLE_HOME[user.role]);
    }
  }, [user, isLoading, allowedRoles, loginPath, router]);

  if (isLoading) return <FullPageLoader label="Restoring your session" />;
  if (!user) return <FullPageLoader label="Redirecting to sign in" />;

  if (!allowedRoles.includes(user.role)) {
    return (
      <RedirectNotice
        title={`This area is for ${allowedRoles.map((role) => ROLE_LABELS[role]).join(' or ')}.`}
        detail={`You are signed in as ${ROLE_LABELS[user.role]}, so this page is not available to you. Taking you to your own home.`}
        href={ROLE_HOME[user.role]}
        actionLabel="Go to my home"
      />
    );
  }

  return <>{children}</>;
}

/**
 * Restricts a subtree to signed-out visitors (login and registration pages).
 *
 * Opening a login page while already signed in redirects to the role's home
 * route. The visitor is told who they are signed in as and why, because a
 * silent redirect is indistinguishable from a page that hangs.
 */
export function AnonymousOnly({ children }: { children: ReactNode }): JSX.Element {
  const { user, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) router.replace(ROLE_HOME[user.role]);
  }, [user, isLoading, router]);

  if (isLoading) return <FullPageLoader />;

  if (user) {
    return (
      <RedirectNotice
        title={`You are already signed in as ${ROLE_LABELS[user.role]}.`}
        detail="Signing in as a different role requires signing out first, because each portal keeps its own session."
        href={ROLE_HOME[user.role]}
        actionLabel="Continue to my dashboard"
      />
    );
  }

  return <>{children}</>;
}