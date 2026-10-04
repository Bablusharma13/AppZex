import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Building2,
  FolderKanban,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Building2,
    title: 'Multi-tenant by design',
    description:
      'Every agency is an isolated tenant. Clients, projects, tasks and files are scoped server-side, never by a parameter the browser can change.',
  },
  {
    icon: FolderKanban,
    title: 'Delivery that reflects reality',
    description:
      'Project progress is derived from completed tasks rather than a typed-in percentage, so the number always matches the work.',
  },
  {
    icon: Users,
    title: 'Client portal',
    description:
      'Clients see only their own projects, meetings and files, with a feedback and change-request workflow built in.',
  },
  {
    icon: Sparkles,
    title: 'AI meeting summaries',
    description:
      'Turn meeting notes into a summary, decisions and action items, then convert those actions into real tasks.',
  },
  {
    icon: MessageSquare,
    title: 'Feedback loop',
    description:
      'Change requests, bug reports and design notes flow from the client portal into the agency workspace.',
  },
  {
    icon: ShieldCheck,
    title: 'Auditable support mode',
    description:
      'Platform administrators can enter an agency workspace through a time-boxed, logged session - never by changing a URL.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-sm font-semibold">AppZex AgencyOS</span>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/client/login">Client sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">Agency sign in</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Multi-tenant agency project management
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Run every client project from one secure workspace.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            A production-minded SaaS for digital agencies: tenant isolation enforced on the server, a
            dedicated client portal, and AI-assisted meeting summaries.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/login">Sign in to your agency</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/register">Create an agency</Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link href="/admin/login">Platform admin</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-border bg-card p-5">
                <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="mt-3 text-sm font-semibold">{feature.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground sm:px-6">
          AppZex AgencyOS · Full stack developer technical assignment
        </div>
      </footer>
    </div>
  );
}