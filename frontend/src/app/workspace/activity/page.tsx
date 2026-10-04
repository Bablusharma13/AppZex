'use client';

import { useState } from 'react';
import { Activity as ActivityIcon, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { VisibilityBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { workspaceService } from '@/services/workspace.service';
import type { ActivityListQuery, ActivityLogDto } from '@/types/api';
import { VISIBILITY, type Visibility } from '@/types/enums';
import { formatDateTime, formatRelative, humanizeEvent } from '@/utils/format';

const PAGE_SIZE = 25;

/** Event types offered as filters; the API accepts any dotted event name. */
const EVENT_FILTERS = [
  'project.created',
  'task.created',
  'task.completed',
  'milestone.completed',
  'meeting.created',
  'feedback.submitted',
  'feedback.resolved',
  'file.uploaded',
  'user.created',
  'support_mode.entered',
];

const columns: Column<ActivityLogDto>[] = [
  {
    header: 'Event',
    cell: (entry) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{humanizeEvent(entry.eventType)}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{entry.eventType}</p>
      </div>
    ),
  },
  {
    header: 'Actor',
    cell: (entry) => (
      <div className="min-w-0">
        <p className="truncate text-sm">{entry.actorName}</p>
        <p className="text-xs text-muted-foreground">{entry.actorType}</p>
      </div>
    ),
  },
  {
    header: 'Entity',
    cell: (entry) => <span className="text-xs text-muted-foreground">{entry.relatedEntityType ?? '—'}</span>,
  },
  { header: 'Visibility', cell: (entry) => <VisibilityBadge visibility={entry.visibility} /> },
  {
    header: 'When',
    cell: (entry) => (
      <div className="whitespace-nowrap">
        <p className="text-sm">{formatDateTime(entry.createdAt)}</p>
        <p className="text-xs text-muted-foreground">{formatRelative(entry.createdAt)}</p>
      </div>
    ),
  },
];

/**
 * Tenant activity log.
 *
 * Every entry is written by the backend when something changes, so this page is
 * a pure read: the tenant comes from the session, and a client account only
 * ever receives CLIENT_VISIBLE entries from the API.
 */
export default function WorkspaceActivityPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [eventType, setEventType] = useState('');
  const [visibility, setVisibility] = useState<Visibility | ''>('');
  const search = useDebouncedValue(searchInput, 350);

  const query: ActivityListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    eventType: eventType || undefined,
    visibility: visibility || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => workspaceService.listActivity(query, signal),
    [page, search, eventType, visibility],
  );
return (
    <>
      <PageHeader
        title="Activity"
        description="An audit trail of everything that happened in this workspace."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="activity-search">Search</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="activity-search"
                className="pl-9"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  setPage(1);
                }}
                placeholder="Actor or entity name"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1.5">
            <Label htmlFor="activity-event">Event type</Label>
            <Select
              id="activity-event"
              value={eventType}
              onChange={(event) => {
                setEventType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All events</option>
              {EVENT_FILTERS.map((type) => (
                <option key={type} value={type}>
                  {humanizeEvent(type)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex-1 space-y-1.5">
            <Label htmlFor="activity-visibility">Visibility</Label>
            <Select
              id="activity-visibility"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value as Visibility | '');
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value={VISIBILITY.INTERNAL}>Internal</option>
              <option value={VISIBILITY.CLIENT_VISIBLE}>Client visible</option>
            </Select>
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState
              title="Could not load the activity log"
              message={error.message}
              onRetry={reload}
            />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(entry) => entry.id}
              isLoading={isLoading}
              caption="Workspace activity log"
              emptyState={
                <EmptyState
                  icon={ActivityIcon}
                  title="No activity recorded"
                  description="Events appear here as your team works."
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
        Entries marked <Badge variant="info">client visible</Badge> are the only ones shared with
        client accounts.
      </p>
    </>
  );
}