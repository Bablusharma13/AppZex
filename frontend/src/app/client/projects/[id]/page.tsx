'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ClipboardList, Clock } from 'lucide-react';

import { ErrorState } from '@/components/feedback-states';
import { Breadcrumbs, PageHeader } from '@/components/page-header';
import { ProgressBar } from '@/components/progress-bar';
import { PriorityBadge, ProjectStatusBadge } from '@/components/status-badges';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FullPageLoader } from '@/components/ui/skeleton';
import { useAsyncData } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { fileService } from '@/services/file.service';
import { clientPortalService } from '@/services/workspace.service';
import type { FileDto } from '@/types/api';
import { formatDate } from '@/utils/format';

import { FeedbackList, FileList, MeetingList, MilestoneList, ProgressStat } from './sections';

/**
 * Client-facing project detail.
 *
 * The project id comes from the URL, so this is the one place a client could
 * attempt an IDOR. The backend rejects any project outside the caller's company
 * before returning a single field, and this page surfaces that refusal plainly
 * rather than rendering anything it was sent.
 */
export default function ClientProjectDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const toast = useToast();

  const project = useAsyncData(() => clientPortalService.getProject(projectId), [projectId]);
  const milestones = useAsyncData(
    (signal) => clientPortalService.listMilestones(projectId, signal),
    [projectId],
  );
  const meetings = useAsyncData(
    (signal) => clientPortalService.listMeetings(projectId, signal),
    [projectId],
  );
  const feedback = useAsyncData(
    (signal) => clientPortalService.listFeedback({ projectId, limit: 50 }, signal),
    [projectId],
  );
  const files = useAsyncData(
    (signal) => clientPortalService.listFiles({ projectId, limit: 50 }, signal),
    [projectId],
  );

  const handleDownload = async (file: FileDto): Promise<void> => {
    try {
      await fileService.save(file);
    } catch (caught) {
      toast.error('Download blocked', (caught as Error).message);
    }
  };

  if (project.isLoading) return <FullPageLoader label="Loading project" />;

  if (project.error) {
    // A 404 or 403 here means the project is not this client's. Both are shown
    // as "not available" so a client cannot probe for the existence of another
    // company's project by comparing error messages.
    const denied = project.error.isNotFound || project.error.isForbidden;

    return (
      <>
        <PageHeader title="Project" />
        {denied ? (
          <ErrorState
            title="Project not available"
            message="This project does not exist, or it does not belong to your company."
          />
        ) : (
          <ErrorState
            title="Could not load the project"
            message={project.error.message}
            onRetry={project.reload}
          />
        )}
        <Link href="/client/projects" className="text-sm font-medium text-primary hover:underline">
          Back to your projects
        </Link>
      </>
    );
  }

  // Narrowed once so every usage below is the non-null project.
  const data = project.data;
  if (!data) return <FullPageLoader label="Loading project" />;
return (
    <>
      <Breadcrumbs items={[{ label: 'Projects', href: '/client/projects' }, { label: data.name }]} />
      <PageHeader title={data.name} description={data.description ?? undefined} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="mt-2">
            <ProjectStatusBadge status={data.status} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Priority</p>
          <div className="mt-2">
            <PriorityBadge priority={data.priority} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Started</p>
          <p className="mt-2 text-sm font-medium">{formatDate(data.startDate)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Expected completion</p>
          <p className="mt-2 text-sm font-medium">
            {data.expectedCompletionDate ? formatDate(data.expectedCompletionDate) : 'Not set'}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressBar value={data.progress.progressPercentage} label="Overall completion" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ProgressStat
              icon={CheckCircle2}
              label="Completed"
              value={data.progress.completedTasks}
            />
            <ProgressStat icon={Clock} label="In progress" value={data.progress.inProgressTasks} />
            <ProgressStat
              icon={ClipboardList}
              label="To do"
              value={data.progress.todoTasks + data.progress.reviewTasks}
            />
            <ProgressStat icon={ClipboardList} label="Total tasks" value={data.progress.totalTasks} />
          </div>
          <p className="text-xs text-muted-foreground">
            Progress is calculated from completed tasks by your agency, never typed in by hand.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <CardContent>
            <MilestoneList
              milestones={milestones.data?.items ?? []}
              isLoading={milestones.isLoading}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingList meetings={meetings.data?.items ?? []} isLoading={meetings.isLoading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your feedback</CardTitle>
          </CardHeader>
          <CardContent>
            <FeedbackList items={feedback.data?.items ?? []} isLoading={feedback.isLoading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shared files</CardTitle>
          </CardHeader>
          <CardContent>
            <FileList
              files={files.data?.items ?? []}
              isLoading={files.isLoading}
              onDownload={(file) => void handleDownload(file)}
            />
          </CardContent>
        </Card>
      </div>

      <Link
        href="/client/projects"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to your projects
      </Link>
    </>
  );
}