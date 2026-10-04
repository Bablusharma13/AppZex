'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { AuthShell, PortalSwitch } from '@/components/auth-shell';
import { InlineAlert } from '@/components/feedback-states';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useSession, type Portal } from '@/hooks/use-session';
import { ApiError } from '@/lib/api-client';
import { ROLE_HOME, ROLE_LOGIN } from '@/types/enums';

export interface LoginFormProps {
  portal: Portal;
  portalLabel: string;
  title: string;
  subtitle: string;
  /** Optional demo credentials, shown only in the seeded demo environment. */
  demoAccounts?: { label: string; email: string }[];
  /** Links to the other portals. */
  siblingLinks: { href: string; label: string }[];
}

/**
 * Shared sign-in form used by all three portals.
 *
 * The form is intentionally identical everywhere: which portal is being used is
 * sent as `expectedPortal` so the backend can give a precise error, but the
 * stored role remains the only authority for what the account may access.
 */
export function LoginForm({
  portal,
  portalLabel,
  title,
  subtitle,
  demoAccounts,
  siblingLinks,
}: LoginFormProps): JSX.Element {
  const router = useRouter();
  const { login } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await login(email.trim(), password, portal);
      // Route to the portal that matches the *verified* role, not the one used
      // to sign in, so a mismatched session still lands somewhere valid.
      router.replace(ROLE_HOME[user.role] ?? ROLE_LOGIN[user.role]);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Unable to sign in. Please try again.',
      );
      setIsSubmitting(false);
    }
  };

  /** Fills the form with a seeded demo identity. Not a hook: no React state. */
  const applyDemoAccount = (demoEmail: string): void => {
    setEmail(demoEmail);
    setPassword('AgencyDemo123!');
  };

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      portalLabel={portalLabel}
      footer={<PortalSwitch links={siblingLinks} />}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? <InlineAlert message={error} /> : null}

        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
            aria-invalid={Boolean(error)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Sign in
        </Button>
      </form>

      {demoAccounts?.length ? (
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Demo accounts
          </p>
          <div className="space-y-1">
            {demoAccounts.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => applyDemoAccount(account.email)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
              >
                <span className="font-medium">{account.label}</span>
                <span className="text-muted-foreground">{account.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Demo password: <code className="font-mono">AgencyDemo123!</code>
          </p>
        </div>
      ) : null}
    </AuthShell>
  );
}