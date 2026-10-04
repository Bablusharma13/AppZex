'use client';

import { useState } from 'react';
import { Calendar, Search } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { VisibilityBadge } from '@/components/status-badges';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { clientPortalService } from '@/services/workspace.service';
import type { MeetingDto, MeetingListQuery, ProjectDto } from '@/types/api';
import { formatDate, formatDateTime } from '@/utils/format';

const PAGE_SIZE = 20;

/** A single shared meeting card, including its AI summary when present. */
function MeetingCard({ meeting, projectName }: { meeting: MeetingDto; projectName: string }): JSX.Element {
  const summary = meeting.aiSummary;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{meeting.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {projectName || 'Project'} · {formatDateTime(meeting.date)}
            </p>
          </div>
          <VisibilityBadge visibility={meeting.visibility} />
        </div>

        {meeting.notes ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{meeting.notes}</p>
        ) : null}

        {summary ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              AI summary
            </p>
            <p className="mt-1.5 text-sm">{summary.summary}</p>

            {summary.decisions.length ? (
              <div className="mt-3">
                <p className="text-xs font-medium">Decisions</p>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {summary.decisions.map((decision, index) => (
                    <li key={index}>{decision}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {summary.actionItems.length ? (
              <div className="mt-3">
                <p className="text-xs font-medium">Action items</p>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  {summary.actionItems.map((item, index) => (
                    <li key={index}>
                      {item.title}
                      {item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Meetings shared with the client.
 *
 * The API filters to CLIENT_VISIBLE meetings on the caller's own projects and
 * strips `internalNotes`, so nothing agency-only reaches this page.
 */
export default function ClientMeetingsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [projectId, setProjectId] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const query: MeetingListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    projectId: projectId || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => clientPortalService.listMeetings(query, signal),
    [page, search, projectId],
  );

  const projects = useAsyncData(
    (signal) => clientPortalService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );

  const projectName = (id: string): string =>
    projects.data?.items.find((project: ProjectDto) => project.id === id)?.name ?? '';
return (
    <>
      <PageHeader
        title="Meetings"
        description="Meeting notes and AI summaries your agency has shared with you."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="client-meeting-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="client-meeting-search"
              className="pl-9"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Meeting title"
            />
          </div>
        </div>
        <div className="sm:w-64">
          <div className="space-y-1.5">
            <Label htmlFor="client-meeting-project">Project</Label>
            <Select
              id="client-meeting-project"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All projects</option>
              {projects.data?.items.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState title="Could not load meetings" message={error.message} onRetry={reload} />
      ) : isLoading ? (
        <Card>
          <CardContent className="space-y-3 py-6" role="status" aria-label="Loading meetings">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-md bg-muted" />
            ))}
          </CardContent>
        </Card>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={Calendar}
            title="No meetings shared"
            description="Your agency shares meeting notes here when they are ready."
          />
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {data.items.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                projectName={projectName(meeting.projectId)}
              />
            ))}
          </div>

          <Card>
            <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} />
          </Card>
        </>
      )}
    </>
  );
}