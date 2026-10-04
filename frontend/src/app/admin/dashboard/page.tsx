'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  Building2,
  Briefcase,
  CheckCircle2,
  FolderKanban,
  Users,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAsyncData } from '@/hooks/use-async';
import { adminService } from '@/services/auth.service';
import { formatRelative, humanizeEvent } from '@/utils/format';
import { AGENCY_STATUS_LABELS, PLANS } from '@/types/enums';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#10b981',
  SUSPENDED: '#ef4444',
  INACTIVE: '#94a3b8',
};

const PLAN_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'];

export default function AdminDashboardPage(): JSX.Element {
  const { data, isLoading, error, reload } = useAsyncData(
    () => adminService.metrics(),
    [],
  );

  const planChart = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.agenciesByPlan).map(([plan, count]) => ({
      name: PLANS[plan as keyof typeof PLANS] ?? plan,
      agencies: count,
    }));
  }, [data]);

  const statusChart = useMemo(() => {
    if (!data) return [];
    return [
      { name: AGENCY_STATUS_LABELS.ACTIVE, value: data.activeAgencies, key: 'ACTIVE' },
      { name: AGENCY_STATUS_LABELS.SUSPENDED, value: data.suspendedAgencies, key: 'SUSPENDED' },
      { name: AGENCY_STATUS_LABELS.INACTIVE, value: data.inactiveAgencies, key: 'INACTIVE' },
    ].filter((entry) => entry.value > 0);
  }, [data]);

  if (error) {
    return (
      <>
        <PageHeader title="Platform dashboard" />
        <ErrorState
          title="Could not load platform metrics"
          message={error.message}
          onRetry={reload}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Platform dashboard"
        description="Platform-wide metrics across every agency tenant."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total agencies"
          value={data?.totalAgencies ?? '—'}
          icon={Building2}
          hint="All tenants on the platform"
        />
        <StatCard
          label="Active agencies"
          value={data?.activeAgencies ?? '—'}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Suspended agencies"
          value={data?.suspendedAgencies ?? '—'}
          icon={XCircle}
          tone="danger"
          hint="Workspace access disabled"
        />
        <StatCard
          label="Total users"
          value={data?.totalUsers ?? '—'}
          icon={Users}
          hint="Agency staff and client accounts"
        />
        <StatCard
          label="Client companies"
          value={data?.totalClientCompanies ?? '—'}
          icon={Briefcase}
        />
        <StatCard label="Projects" value={data?.totalProjects ?? '—'} icon={FolderKanban} />
        <StatCard label="Tasks" value={data?.totalTasks ?? '—'} icon={CheckCircle2} />
        <StatCard
          label="Recent events"
          value={data?.recentActivity?.length ?? 0}
          icon={Activity}
          hint="Latest activity feed"
        />
      </div>
<div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agencies by status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading chart…</p>
            ) : statusChart.length === 0 ? (
              <EmptyState title="No agency data yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusChart.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agencies by plan</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading chart…</p>
            ) : planChart.length === 0 ? (
              <EmptyState title="No plan data yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={planChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="agencies" radius={[6, 6, 0, 0]}>
                    {planChart.map((entry, index) => (
                      <Cell key={entry.name} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent platform activity</CardTitle>
          <Link href="/admin/activity" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading activity…</p>
          ) : !data?.recentActivity?.length ? (
            <EmptyState title="No activity recorded yet" />
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.slice(0, 10).map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{humanizeEvent(entry.eventType)}</p>
                    <p className="text-xs text-muted-foreground">by {entry.actorName}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelative(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}