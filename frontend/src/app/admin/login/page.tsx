'use client';

import { LoginForm } from '@/components/login-form';
import { AnonymousOnly } from '@/components/route-guard';

export default function AdminLoginPage(): JSX.Element {
  return (
    <AnonymousOnly>
      <LoginForm
        portal="admin"
        portalLabel="Platform administration"
        title="Super admin sign in"
        subtitle="Platform-wide agencies, metrics and audited support mode."
        siblingLinks={[
          { href: '/login', label: 'Agency sign in' },
          { href: '/client/login', label: 'Client portal' },
        ]}
        demoAccounts={[{ label: 'Super admin', email: 'admin@appzex-demo.com' }]}
      />
    </AnonymousOnly>
  );
}