'use client';

import { useState } from 'react';
import { Download, Paperclip, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { fileService } from '@/services/file.service';
import { clientPortalService } from '@/services/workspace.service';
import type { FileDto, FileListQuery, ProjectDto } from '@/types/api';
import { formatBytes, formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

/**
 * Files shared with the client.
 *
 * Only CLIENT_VISIBLE attachments on this company's own projects are ever
 * returned by the API. Downloads are authenticated fetches rather than links,
 * because the backend re-checks ownership and visibility before streaming.
 */
export default function ClientFilesPage(): JSX.Element {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [projectId, setProjectId] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const query: FileListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    projectId: projectId || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => clientPortalService.listFiles(query, signal),
    [page, search, projectId],
  );

  const projects = useAsyncData(
    (signal) => clientPortalService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );

  const handleDownload = async (file: FileDto): Promise<void> => {
    try {
      await fileService.save(file);
    } catch (caught) {
      toast.error('Download blocked', (caught as Error).message);
    }
  };

  const projectName = (id?: string): string =>
    projects.data?.items.find((project: ProjectDto) => project.id === id)?.name ?? '';

  const columns: Column<FileDto>[] = [
    {
      header: 'File',
      cell: (file) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{file.originalName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {file.relatedEntityType.replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>
      ),
    },
    {
      header: 'Project',
      cell: (file) => (
        <span className="text-sm text-muted-foreground">{projectName(file.projectId) || '—'}</span>
      ),
    },
    { header: 'Size', cell: (file) => <span className="text-sm">{formatBytes(file.size)}</span> },
    {
      header: 'Shared',
      cell: (file) => (
        <span className="whitespace-nowrap text-sm">
          {formatDate(file.createdAt)}
          <span className="block text-xs text-muted-foreground">{file.uploadedByName}</span>
        </span>
      ),
    },
    {
      header: '',
      cell: (file) => (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => void handleDownload(file)}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];
return (
    <>
      <PageHeader title="Files" description="Documents your agency has shared with your company." />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="client-file-search">Search</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="client-file-search"
                className="pl-9"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="File name"
              />
            </div>
          </div>
          <div className="sm:w-64">
            <div className="space-y-1.5">
              <Label htmlFor="client-file-project">Project</Label>
              <Select
                id="client-file-project"
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
          <div className="p-4">
            <ErrorState
              title="Could not load shared files"
              message={error.message}
              onRetry={reload}
            />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(file) => file.id}
              isLoading={isLoading}
              caption="Files shared with your company"
              emptyState={
                <EmptyState
                  icon={Paperclip}
                  title="No shared files"
                  description="Documents your agency shares with you will appear here."
                />
              }
            />
            {data ? (
              <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} />
            ) : null}
          </>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Files are never served from a public link. Every download is checked against your account
        before it is served.
      </p>
    </>
  );
}