'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';

/** Shared frame for every authentication screen. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  portalLabel,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  portalLabel: string;
}): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{portalLabel}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 shadow-sm">{children}</div>

          {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </div>

      <footer className="pb-6 text-center text-xs text-muted-foreground">
        AppZex AgencyOS · Tenant-isolated agency project management
      </footer>
    </div>
  );
}

/** Convenience wrapper for "sign in elsewhere" cross-links on login screens. */
export function PortalSwitch({
  links,
}: {
  links: { href: string; label: string }[];
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {links.map((link) => (
        <Button key={link.href} variant="ghost" size="sm" asChild>
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </div>
  );
}