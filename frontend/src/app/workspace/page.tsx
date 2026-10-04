'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock,
  FolderKanban,
  MessageSquare,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { CardSkeleton } from '@/components/ui/skeleton';
import { useAsyncData } from '@/hooks/use-async';
import { workspaceService } from '@/services/workspace.service';
import { formatDate, formatRelative, humanizeEvent } from '@/utils/format';
import {
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  type ProjectStatus,
  type TaskStatus,
} from '@/types/enums';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  ACTIVE: '#10b981',
  ON_HOLD: '#f59e0b',
  COMPLETED: '#3b82f6',
};

const TASK_COLORS: Record<TaskStatus, string> = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  REVIEW: '#f59e0b',
  DONE: '#10b981',
};

/** Agency workspace dashboard. Every figure is scoped to the caller's tenant. */
export default function WorkspaceDashboardPage(): JSX.Element {
  const { data, isLoading, error, reload } = useAsyncData(() => workspaceService.dashboard(), []);

  const projectChart = useMemo(() => {
    const dist = data?.projectStatusDistribution;
    if (!dist) return [];
    return (Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[])
      .map((status) => ({ key: status, name: PROJECT_STATUS_LABELS[status], value: dist[status] ?? 0 }))
      .filter((entry) => entry.value > 0);
  }, [data]);

  const taskChart = useMemo(() => {
    const dist = data?.taskStatusDistribution;
    if (!dist) return [];
    return (Object.keys(TASK_STATUS_LABELS) as TaskStatus[])
      .map((status) => ({ key: status, name: TASK_STATUS_LABELS[status], value: dist[status] ?? 0 }))
      .filter((entry) => entry.value > 0);
  }, [data]);

  if (error) {
    return (
      <>
        <PageHeader title="Workspace" />
        <ErrorState title="Could not load the dashboard" message={error.message} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Workspace" description="Delivery overview for your agency." />

      {isLoading && !data ? (
        <CardSkeleton count={6} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Clients" value={data?.totalClients ?? 0} icon={Briefcase} />
            <StatCard label="Active projects" value={data?.activeProjects ?? 0} icon={FolderKanban} tone="success" />
            <StatCard label="Projects due soon" value={data?.projectsDueSoon ?? 0} icon={Clock} tone="warning" hint="Within 14 days" />
            <StatCard label="Completed projects" value={data?.completedProjects ?? 0} icon={CheckCircle2} />
            <StatCard label="Pending client feedback" value={data?.pendingFeedback ?? 0} icon={MessageSquare} tone="info" />
            <StatCard
              label="Overdue tasks"
              value={data?.overdueTasks ?? 0}
              icon={AlertTriangle}
              tone="danger"
              hint={`${data?.openTasks ?? 0} open of ${data?.totalTasks ?? 0}`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Project status</CardTitle>
              </CardHeader>
              <CardContent>
                {!projectChart.length ? (
                  <EmptyState title="No projects yet" />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={projectChart}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={3}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {projectChart.map((entry) => (
                          <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Task status</CardTitle>
              </CardHeader>
              <CardContent>
                {!taskChart.length ? (
                  <EmptyState title="No tasks yet" />
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={taskChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {taskChart.map((entry) => (
                          <Cell key={entry.key} fill={TASK_COLORS[entry.key]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <div className="space-y-4">
                  <DeadlineGroup
                    title="Tasks"
                    empty="No tasks due in the next 14 days"
                    items={(data?.upcomingDeadlines.tasks ?? []).map((task) => ({
                      id: task.id,
                      primary: task.title,
                      secondary: `${task.projectName}${task.assigneeName ? ` · ${task.assigneeName}` : ''}`,
                      date: task.dueDate,
                    }))}
                  />
                  <DeadlineGroup
                    title="Milestones"
                    empty="No milestones due in the next 14 days"
                    items={(data?.upcomingDeadlines.milestones ?? []).map((milestone) => ({
                      id: milestone.id,
                      primary: milestone.name,
                      secondary: milestone.projectName,
                      date: milestone.dueDate,
                    }))}
                  />
                  <DeadlineGroup
                    title="Projects"
                    empty="No projects due in the next 14 days"
                    items={(data?.upcomingDeadlines.projects ?? []).map((project) => ({
                      id: project.id,
                      primary: project.name,
                      secondary: 'Expected completion',
                      date: project.expectedCompletionDate,
                    }))}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Recent activity</CardTitle>
              <Link href="/workspace/activity" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {!data?.recentActivity?.length ? (
                <EmptyState title="No activity recorded yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentActivity.slice(0, 8).map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{humanizeEvent(entry.eventType)}</p>
                          <p className="truncate text-xs text-muted-foreground">{entry.actorName}</p>
                        </div>
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
      )}
    </>
  );
}

interface DeadlineItem {
  id: string;
  primary: string;
  secondary: string;
  date: string;
}

/** Small presentational list reused for the three deadline groupings. */
function DeadlineGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: DeadlineItem[];
  empty: string;
}): JSX.Element {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.primary}</p>
                <p className="truncate text-xs text-muted-foreground">{item.secondary}</p>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                {formatDate(item.date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}