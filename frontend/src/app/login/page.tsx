'use client';

import { LoginForm } from '@/components/login-form';
import { AnonymousOnly } from '@/components/route-guard';

export default function AgencyLoginPage(): JSX.Element {
  return (
    <AnonymousOnly>
      <LoginForm
        portal="agency"
        portalLabel="Agency workspace"
        title="Sign in to your agency"
        subtitle="Manage clients, projects, delivery and your team."
        siblingLinks={[
          { href: '/client/login', label: 'Client portal' },
          { href: '/admin/login', label: 'Platform admin' },
        ]}
        demoAccounts={[
          { label: 'Agency A · Admin', email: 'agency-a-admin@appzex-demo.com' },
          { label: 'Agency A · Team', email: 'agency-a-team@appzex-demo.com' },
          { label: 'Agency B · Admin', email: 'agency-b-admin@appzex-demo.com' },
        ]}
      />
    </AnonymousOnly>
  );
}