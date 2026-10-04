'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';
import type { SupportSession } from '@/services/auth.service';

/**
 * Highly visible banner shown for the entire time an operator is inside an
 * agency workspace.
 *
 * It renders nothing outside support mode, so it is impossible to be acting
 * within a tenant without that context being on screen. Ending the session is
 * the only way to remove it.
 */
export function SupportBanner({ session }: { session: SupportSession | null }): JSX.Element | null {
  const { exitSupportSession } = useSession();
  const [isExiting, setIsExiting] = useState(false);

  if (!session) return null;

  const remainingMinutes = Math.max(
    0,
    Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 60000),
  );

  const handleExit = async (): Promise<void> => {
    setIsExiting(true);
    try {
      await exitSupportSession();
    } finally {
      // The banner unmounts with the session; reset in case the call fails.
      setIsExiting(false);
    }
  };

  return (
    <div
      className="sticky top-16 z-20 border-b-2 border-amber-400 bg-amber-50 text-amber-950"
      role="alert"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">
              You are viewing Agency: {session.agencyName} as Super Admin
            </p>
            <p className="text-xs">
              Support mode ·{' '}
              {session.scope === 'READ_ONLY' ? 'Read only' : 'Read and write'} · expires in{' '}
              {remainingMinutes} min · every action is recorded in the activity log
            </p>
          </div>
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => void handleExit()}
          isLoading={isExiting}
        >
          Exit Support Mode
        </Button>
      </div>
    </div>
  );
}