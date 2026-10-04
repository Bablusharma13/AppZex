'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { FullPageLoader } from '@/components/ui/skeleton';
import { useSession } from '@/hooks/use-session';
import { ROLE_HOME, type Role } from '@/types/enums';

export interface RouteGuardProps {
  children: ReactNode;
  /** Roles permitted on this route. A user without one is redirected away. */
  allowedRoles: Role[];
  /** Where to send a signed-out visitor. */
  loginPath: string;
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
    return <FullPageLoader label="Redirecting" />;
  }

  return <>{children}</>;
}

/** Restricts a subtree to signed-out visitors (login and registration pages). */
export function AnonymousOnly({ children }: { children: ReactNode }): JSX.Element {
  const { user, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) router.replace(ROLE_HOME[user.role]);
  }, [user, isLoading, router]);

  if (isLoading) return <FullPageLoader />;
  if (user) return <FullPageLoader label="Redirecting" />;

  return <>{children}</>;
}