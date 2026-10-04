'use client';

import { useState } from 'react';
import { MessageSquare, Plus, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { FeedbackStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAction, useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { clientPortalService } from '@/services/workspace.service';
import type { CreateFeedbackInput, FeedbackDto, FeedbackListQuery, ProjectDto } from '@/types/api';
import {
  FEEDBACK_CATEGORY,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from '@/types/enums';
import { formatDateTime } from '@/utils/format';

const PAGE_SIZE = 20;

interface FeedbackForm {
  projectId: string;
  title: string;
  description: string;
  category: FeedbackCategory;
}

/**
 * Client feedback and change requests.
 *
 * Creating here posts to `/collab/client/feedback`, which attributes the record
 * to the caller's own company. A client cannot file feedback against another
 * client's project: the service resolves ownership from the session.
 */
export default function ClientFeedbackPage(): JSX.Element {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const search = useDebouncedValue(searchInput, 350);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FeedbackForm>({
    projectId: '',
    title: '',
    description: '',
    category: 'GENERAL',
  });

  const query: FeedbackListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => clientPortalService.listFeedback(query, signal),
    [page, search, status],
  );

  const projects = useAsyncData(
    (signal) => clientPortalService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );

  const submit = useAction(async (input: CreateFeedbackInput) => {
    return clientPortalService.createFeedback(input);
  });

  const openForm = (projectId = ''): void => {
    setFormError(null);
    setForm({
      projectId,
      title: '',
      description: '',
      category: 'GENERAL',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setFormError(null);

    const result = await submit.run({
      projectId: form.projectId,
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
    });

    if (result === undefined) {
      setFormError(submit.error?.message ?? 'Your feedback could not be submitted.');
      return;
    }

    setIsFormOpen(false);
    toast.success('Feedback sent', 'Your agency has been notified.');
    setPage(1);
    reload();
  };
const columns: Column<FeedbackDto>[] = [
    {
      header: 'Request',
      cell: (item) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{item.title}</p>
          <p className="truncate text-xs text-muted-foreground">{item.project?.name ?? ''}</p>
        </div>
      ),
    },
    {
      header: 'Category',
      cell: (item) => (
        <Badge variant="neutral">
          {FEEDBACK_CATEGORY_LABELS[item.category] ?? item.category}
        </Badge>
      ),
    },
    { header: 'Status', cell: (item) => <FeedbackStatusBadge status={item.status} /> },
    {
      header: 'Submitted',
      cell: (item) => (
        <span className="whitespace-nowrap text-sm">{formatDateTime(item.createdAt)}</span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Raise a change request or report an issue with your project work."
        actions={
          <Button onClick={() => openForm()} disabled={!projects.data?.items.length}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New request
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="client-feedback-search">Search</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="client-feedback-search"
                className="pl-9"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Search requests"
              />
            </div>
          </div>
          <div className="sm:w-56">
            <div className="space-y-1.5">
              <Label htmlFor="client-feedback-status">Status</Label>
              <Select
                id="client-feedback-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as FeedbackStatus | '');
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState
              title="Could not load your feedback"
              message={error.message}
              onRetry={reload}
            />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(item) => item.id}
              isLoading={isLoading}
              caption="Feedback you have submitted"
              emptyState={
                <EmptyState
                  icon={MessageSquare}
                  title="No feedback yet"
                  description="Raise a change request and your agency will pick it up."
                  action={
                    <Button onClick={() => openForm()} disabled={!projects.data?.items.length}>
                      New request
                    </Button>
                  }
                />
              }
            />
            {data ? (
              <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} />
            ) : null}
          </>
        )}
      </Card>
<Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New feedback request</DialogTitle>
            <DialogDescription>
              Describe what you need changed. Your agency will review it and respond here.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError ? <InlineAlert message={formError} /> : null}

            <div className="space-y-1.5">
              <Label htmlFor="feedback-project">Project</Label>
              <Select
                id="feedback-project"
                value={form.projectId}
                onChange={(event) => setForm({ ...form, projectId: event.target.value })}
                required
              >
                <option value="">Select a project</option>
                {projects.data?.items.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-title">Title</Label>
              <Input
                id="feedback-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Short summary of the change"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-category">Category</Label>
              <Select
                id="feedback-category"
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value as FeedbackCategory })
                }
              >
                {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="feedback-description">Details</Label>
              <Textarea
                id="feedback-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="What should change, and why?"
                rows={5}
                required
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
                disabled={submit.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={submit.isPending}>
                Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
