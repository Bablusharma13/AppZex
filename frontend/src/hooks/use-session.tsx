'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { clearSupportSession, getSupportSessionId, onUnauthorized } from '@/lib/api-client';
import { authService, adminService, type SupportSession } from '@/services/auth.service';
import { ROLE_HOME, ROLE_LOGIN, type Role } from '@/types/enums';
import type { PublicUser } from '@/types/api';

const ACCESS_TOKEN_KEY = 'appzex.accessToken';
const REFRESH_TOKEN_KEY = 'appzex.refreshToken';

export type Portal = 'admin' | 'agency' | 'client';

interface SessionContextValue {
  /** Current principal, or null when signed out. */
  user: PublicUser | null;
  /** True while the stored token is being validated on first paint. */
  isLoading: boolean;
  /** Portal that currently owns the session: admin, agency or client. */
  portal: Portal | null;
  /** Support session, only ever set for a super admin. */
  supportSession: SupportSession | null;
  login: (email: string, password: string, portal: Portal) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  startSupportSession: (
    agencyId: string,
    reason: string,
    scope: string,
    durationMinutes: number,
  ) => Promise<SupportSession>;
  exitSupportSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Which portal a role belongs to. */
export function portalForRole(role: Role): Portal {
  if (role === 'SUPER_ADMIN') return 'admin';
  if (role === 'CLIENT') return 'client';
  return 'agency';
}

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);

  /** Wipes every credential held in the browser. */
  const clearLocalSession = useCallback(() => {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    clearSupportSession();
    setUser(null);
    setSupportSession(null);
  }, []);

  // Restore the session on first paint by validating the stored token against
  // the API. A token that the backend rejects is discarded immediately.
  useEffect(() => {
    let cancelled = false;

    const restore = async (): Promise<void> => {
      const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const profile = await authService.me();
        if (!cancelled) setUser(profile);
      } catch {
        if (!cancelled) clearLocalSession();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearLocalSession]);

  // A 401 from any request means the session is gone; sign out globally rather
  // than leaving individual pages in an inconsistent state.
  useEffect(() => {
    onUnauthorized(() => {
      clearLocalSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    });
  }, [clearLocalSession]);
const login = useCallback(
    async (email: string, password: string, portal: Portal): Promise<PublicUser> => {
      const result = await authService.login(email, password, portal);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
      setUser(result.user);
      return result.user;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      // Best effort: tells the backend to record the sign-out.
      if (window.localStorage.getItem(ACCESS_TOKEN_KEY)) await authService.logout();
    } catch {
      // A failed sign-out call must never trap the user in the app.
    } finally {
      clearLocalSession();
      window.location.href = '/login';
    }
  }, [clearLocalSession]);

  const refreshUser = useCallback(async (): Promise<void> => {
    const profile = await authService.me();
    setUser(profile);
  }, []);

  const startSupportSession = useCallback(
    async (
      agencyId: string,
      reason: string,
      scope: string,
      durationMinutes: number,
    ): Promise<SupportSession> => {
      const session = await adminService.startSupportSession({
        agencyId,
        reason,
        scope,
        durationMinutes,
      });
      // Stored so the API client can attach it to subsequent requests. The
      // header value alone grants nothing: the backend re-validates the session
      // against the database on every call.
      window.localStorage.setItem('appzex.supportSession', session.sessionId);
      setSupportSession(session);
      return session;
    },
    [],
  );

  const exitSupportSession = useCallback(async (): Promise<void> => {
    const sessionId = getSupportSessionId();
    try {
      if (sessionId) await adminService.endSupportSession(sessionId);
    } catch {
      // Expiring or already-ended sessions are fine; drop it locally regardless.
    } finally {
      clearSupportSession();
      setSupportSession(null);
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      isLoading,
      portal: user ? portalForRole(user.role) : null,
      supportSession,
      login,
      logout,
      refreshUser,
      startSupportSession,
      exitSupportSession,
    }),
    [
      user,
      isLoading,
      supportSession,
      login,
      logout,
      refreshUser,
      startSupportSession,
      exitSupportSession,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Access the session. Throws when used outside the provider. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}

export { ROLE_HOME, ROLE_LOGIN };