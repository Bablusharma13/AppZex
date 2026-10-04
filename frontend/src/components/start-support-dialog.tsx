'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { InlineAlert } from '@/components/feedback-states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api-client';

export interface StartSupportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencyId: string;
  agencyName: string;
  /** Called once the session is live, so the caller can navigate. */
  onStarted: () => void;
}

/**
 * Starts an audited support session against one agency.
 *
 * A reason is mandatory and the session is time-boxed on the server. Nothing
 * here grants access by itself: the backend records the session and re-reads it
 * on every subsequent request.
 */
export function StartSupportDialog({
  open,
  onOpenChange,
  agencyId,
  agencyName,
  onStarted,
}: StartSupportDialogProps): JSX.Element {
  const { startSupportSession } = useSession();

  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'READ_ONLY' | 'READ_WRITE'>('READ_ONLY');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleStart = async (): Promise<void> => {
    setError(null);
    setIsPending(true);
    try {
      await startSupportSession(agencyId, reason.trim(), scope, Number(durationMinutes));
      setReason('');
      onOpenChange(false);
      onStarted();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not start the support session.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter support mode</DialogTitle>
          <DialogDescription>
            You are about to act inside <span className="font-medium">{agencyName}</span>. The session is
            time-boxed and every action you take is written to that agency&apos;s activity log.
          </DialogDescription>
        </DialogHeader>

        {error ? <InlineAlert message={error} /> : null}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-reason">Reason for access (required)</Label>
            <Textarea
              id="support-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Investigating a customer-reported login issue"
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-scope">Access level</Label>
            <Select
              id="support-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as 'READ_ONLY' | 'READ_WRITE')}
            >
              <option value="READ_ONLY">Read only — inspect without changing anything</option>
              <option value="READ_WRITE">Read and write — may make changes on their behalf</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-duration">Duration (minutes)</Label>
            <Input
              id="support-duration"
              type="number"
              min={1}
              max={480}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleStart()}
            isLoading={isPending}
            disabled={reason.trim().length === 0}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Start support session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}