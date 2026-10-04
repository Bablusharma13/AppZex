'use client';

import { LoginForm } from '@/components/login-form';
import { AnonymousOnly } from '@/components/route-guard';

export default function ClientLoginPage(): JSX.Element {
  return (
    <AnonymousOnly>
      <LoginForm
        portal="client"
        portalLabel="Client portal"
        title="Sign in to your client portal"
        subtitle="Track your projects, share feedback and access shared files."
        siblingLinks={[
          { href: '/login', label: 'Agency sign in' },
          { href: '/admin/login', label: 'Platform admin' },
        ]}
        demoAccounts={[
          { label: 'Agency A client · Lumina Retail', email: 'agency-a-client@appzex-demo.com' },
          { label: 'Agency B client · Cascade Foods', email: 'agency-b-client@appzex-demo.com' },
        ]}
      />
    </AnonymousOnly>
  );
}