'use client';

import Link from 'next/link';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  FolderKanban,
  MessageSquare,
  Paperclip,
} from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader, StatCard } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useAsyncData } from '@/hooks/use-async';
import { clientPortalService } from '@/services/workspace.service';
import type { ActivityLogDto } from '@/types/api';
import { formatDate, formatRelative, humanizeEvent } from '@/utils/format';

/** One row in the "recent updates" feed. */
function UpdateRow({ entry }: { entry: ActivityLogDto }): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{humanizeEvent(entry.eventType)}</p>
        <p className="truncate text-xs text-muted-foreground">{entry.actorName}</p>
      </div>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {formatRelative(entry.createdAt)}
      </span>
    </li>
  );
}

/**
 * Client portal dashboard.
 *
 * Every figure comes from `/activity/client/dashboard`, which aggregates only
 * over the caller's own `clientId`. Nothing here can be widened from the
 * browser: the service resolves the company from the verified session.
 */
export default function ClientDashboardPage(): JSX.Element {
  const { data, isLoading, error, reload } = useAsyncData(
    () => clientPortalService.dashboard(),
    [],
  );

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState title="Could not load your dashboard" message={error.message} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={data?.companyName || 'Dashboard'}
        description="Everything your agency is currently delivering for you."
      />

      {isLoading && !data ? (
        <CardSkeleton count={4} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Active projects"
              value={data?.activeProjects ?? 0}
              icon={FolderKanban}
              tone="success"
            />
            <StatCard
              label="Completed projects"
              value={data?.completedProjects ?? 0}
              icon={CheckCircle2}
            />
            <StatCard
              label="Open feedback"
              value={data?.openFeedback ?? 0}
              icon={MessageSquare}
              tone="info"
              hint="Awaiting your agency"
            />
            <StatCard
              label="Upcoming deadlines"
              value={data?.upcomingDeadlines?.length ?? 0}
              icon={Clock}
              tone="warning"
              hint="Within 14 days"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming deadlines</CardTitle>
              </CardHeader>
              <CardContent>
                {!data?.upcomingDeadlines?.length ? (
                  <EmptyState
                    title="Nothing due soon"
                    description="Your agency has no projects closing in the next two weeks."
                  />
                ) : (
                  <ul className="space-y-3">
                    {data.upcomingDeadlines.map((deadline) => (
                      <li key={deadline.id} className="flex items-center justify-between gap-3">
                        <Link
                          href={`/client/projects/${deadline.id}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {deadline.name}
                        </Link>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(deadline.expectedCompletionDate)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
<Card>
              <CardHeader>
                <CardTitle>Shared with you</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      Client-visible meetings
                    </span>
                    <span className="font-medium tabular-nums">
                      {data?.clientVisibleMeetings ?? 0}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Paperclip className="h-4 w-4" aria-hidden="true" />
                      Shared files
                    </span>
                    <span className="font-medium tabular-nums">{data?.sharedFiles ?? 0}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <MessageSquare className="h-4 w-4" aria-hidden="true" />
                      Pending actions for you
                    </span>
                    <span className="font-medium tabular-nums">{data?.pendingActions ?? 0}</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent updates</CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.recentActivity?.length ? (
                <EmptyState
                  icon={Activity}
                  title="No updates yet"
                  description="Project updates from your agency will appear here."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentActivity.slice(0, 8).map((entry) => (
                    <UpdateRow key={entry.id} entry={entry} />
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