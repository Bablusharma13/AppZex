'use client';

import { useState } from 'react';
import { MessageSquare, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { FeedbackStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { collabService } from '@/services/collab.service';
import type { FeedbackDto, FeedbackListQuery } from '@/types/api';
import { FEEDBACK_STATUS, FEEDBACK_STATUS_LABELS, type FeedbackStatus } from '@/types/enums';
import { formatDateTime } from '@/utils/format';

const PAGE_SIZE = 20;

/**
 * Client feedback and change requests.
 *
 * The agency side of the loop: review, respond and change status. Clients raise
 * these from their own portal, where the project list is scoped to their company.
 */
export default function WorkspaceFeedbackPage(): JSX.Element {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<FeedbackStatus | ''>('');
  const search = useDebouncedValue(searchInput, 350);

  const [selected, setSelected] = useState<FeedbackDto | null>(null);
  const [nextStatus, setNextStatus] = useState<FeedbackStatus>('IN_REVIEW');
  const [response, setResponse] = useState('');

  const query: FeedbackListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => collabService.listFeedback(query, signal),
    [page, search, status],
  );

  const respond = useAction(async () => {
    if (!selected) return undefined;
    return collabService.updateFeedbackStatus(selected.id, nextStatus, response || undefined);
  });

  const openResponse = (feedback: FeedbackDto): void => {
    setSelected(feedback);
    setNextStatus(feedback.status === 'OPEN' ? 'IN_REVIEW' : feedback.status);
    setResponse(feedback.agencyResponse ?? '');
  };

  const handleRespond = async (): Promise<void> => {
    const result = await respond.run();
    if (result === undefined) {
      toast.error('Could not update the feedback', respond.error?.message);
      return;
    }
    setSelected(null);
    toast.success('Feedback updated.');
    reload();
  };
  const columns: Column<FeedbackDto>[] = [
    {
      header: 'Feedback',
      cell: (feedback) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{feedback.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {feedback.client?.companyName ?? ''} · {feedback.project?.name ?? ''}
          </p>
        </div>
      ),
    },
    { header: 'Category', cell: (feedback) => <Badge variant="neutral">{feedback.category}</Badge> },
    { header: 'Status', cell: (feedback) => <FeedbackStatusBadge status={feedback.status} /> },
    {
      header: 'Submitted',
      cell: (feedback) => (
        <span className="whitespace-nowrap text-sm">{formatDateTime(feedback.createdAt)}</span>
      ),
    },
    {
      header: '',
      cell: (feedback) => (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => openResponse(feedback)}>
            Review
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Change requests and issues raised by clients, with a full reply history."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Search feedback"
              className="pl-9"
              aria-label="Search feedback"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as FeedbackStatus | '');
              setPage(1);
            }}
            className="sm:w-44"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.values(FEEDBACK_STATUS).map((value) => (
              <option key={value} value={value}>
                {FEEDBACK_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load feedback" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(feedback) => feedback.id}
              isLoading={isLoading}
              caption="Client feedback"
              emptyState={
                <EmptyState
                  icon={MessageSquare}
                  title="No feedback found"
                  description="Client feedback appears here as soon as it is submitted."
                />
              }
            />
            {data ? <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} /> : null}
          </>
        )}
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {selected?.client?.companyName} · {selected?.project?.name}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{selected.description}</p>
                </CardContent>
              </Card>

              {selected.replies.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Conversation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {selected.replies.map((reply, index) => (
                        <li key={`${reply.createdAt}-${index}`} className="text-sm">
                          <p className="text-xs text-muted-foreground">
                            {reply.authorName} · {formatDateTime(reply.createdAt)}
                          </p>
                          <p className="whitespace-pre-wrap">{reply.body}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="feedback-response">Response to the client</Label>
                <Textarea
                  id="feedback-response"
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={4}
                  placeholder="Explain what will happen and when."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-status">Status</Label>
                <Select
                  id="feedback-status"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as FeedbackStatus)}
                >
                  {Object.values(FEEDBACK_STATUS).map((value) => (
                    <option key={value} value={value}>
                      {FEEDBACK_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleRespond()} isLoading={respond.isPending}>
              Save response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}