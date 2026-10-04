'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FolderKanban, Search } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ProgressBar } from '@/components/progress-bar';
import { PriorityBadge, ProjectStatusBadge } from '@/components/status-badges';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { clientPortalService } from '@/services/workspace.service';
import type { ProjectDto, ProjectListQuery } from '@/types/api';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/types/enums';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 12;

/**
 * Projects belonging to the signed-in client company.
 *
 * The backend scopes this to the caller's own `clientId`, so editing a project
 * id in the URL cannot reach another company's work.
 */
export default function ClientProjectsPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const search = useDebouncedValue(searchInput, 350);

  const query: ProjectListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => clientPortalService.listProjects(query, signal),
    [page, search, status],
  );

  return (
    <>
      <PageHeader title="Projects" description="Work your agency is delivering for your company." />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="client-project-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="client-project-search"
              className="pl-9"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Project name"
            />
          </div>
        </div>
        <div className="sm:w-56">
          <div className="space-y-1.5">
            <Label htmlFor="client-project-status">Status</Label>
            <Select
              id="client-project-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ProjectStatus | '');
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState title="Could not load your projects" message={error.message} onRetry={reload} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-lg border border-border bg-card" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Projects your agency shares with you will appear here."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
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

/** Summary card linking to the project detail view. */
function ProjectCard({ project }: { project: ProjectDto }): JSX.Element {
  return (
    <Link href={`/client/projects/${project.id}`} className="block">
      <Card className="h-full p-5 transition-colors hover:border-primary/50">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold leading-tight">{project.name}</h2>
          <ProjectStatusBadge status={project.status} />
        </div>

        {project.description ? (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{project.description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={project.priority} />
          {project.expectedCompletionDate ? (
            <span className="text-xs text-muted-foreground">
              Due {formatDate(project.expectedCompletionDate)}
            </span>
          ) : null}
        </div>

        <div className="mt-4">
          <ProgressBar
            value={project.progress.progressPercentage}
            label={`${project.progress.completedTasks} of ${project.progress.totalTasks} tasks`}
          />
        </div>
      </Card>
    </Link>
  );
}