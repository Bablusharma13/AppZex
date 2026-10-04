'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { AuthShell, PortalSwitch } from '@/components/auth-shell';
import { InlineAlert } from '@/components/feedback-states';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { AnonymousOnly } from '@/components/route-guard';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api-client';
import { authService } from '@/services/auth.service';
import { ROLE_HOME } from '@/types/enums';

/**
 * Public agency sign-up.
 *
 * Creates a brand-new tenant plus its first AGENCY_ADMIN. The caller is signed
 * in immediately, so the session context is reused rather than duplicating the
 * token storage logic that `useSession` already owns.
 */
export default function RegisterPage(): JSX.Element {
  const router = useRouter();
  const { login } = useSession();

  const [agencyName, setAgencyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await authService.register({
        agencyName: agencyName.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });

      // Sign in with the credentials just created so the user lands in the
      // workspace without an extra round trip through the login form.
      const user = await login(email.trim(), password, 'agency');
      router.replace(ROLE_HOME[user.role] ?? '/workspace');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Registration failed. Try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <AnonymousOnly>
      <AuthShell
        portalLabel="Agency workspace"
        title="Create your agency"
        subtitle="Set up a new tenant. You become its first administrator."
        footer={
          <PortalSwitch
            links={[
              { href: '/login', label: 'Agency sign in' },
              { href: '/client/login', label: 'Client portal' },
              { href: '/admin/login', label: 'Platform admin' },
            ]}
          />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error ? <InlineAlert message={error} /> : null}

          <div className="space-y-2">
            <Label htmlFor="agency-name">Agency name</Label>
            <Input
              id="agency-name"
              value={agencyName}
              onChange={(event) => setAgencyName(event.target.value)}
              placeholder="Northwind Digital"
              maxLength={160}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="your-name">Your name</Label>
            <Input
              id="your-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Alex Morgan"
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-email">Work email</Label>
            <Input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters, including an uppercase letter, a lowercase letter and a
              number.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-phone">Phone (optional)</Label>
            <Input
              id="register-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              maxLength={32}
            />
          </div>

          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            Create agency
          </Button>
        </form>
      </AuthShell>
    </AnonymousOnly>
  );
}