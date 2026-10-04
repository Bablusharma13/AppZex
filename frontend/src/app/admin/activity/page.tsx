'use client';

import { useState } from 'react';

import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { VisibilityBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { adminService } from '@/services/auth.service';
import type { PageMeta } from '@/services/auth.service';
import { formatDateTime, humanizeEvent } from '@/utils/format';
import { VISIBILITY, type Visibility } from '@/types/enums';
import type { ActivityLogDto } from '@/types/api';

const PAGE_SIZE = 30;

/**
 * Platform-wide activity feed.
 *
 * Super admin only: this is the cross-tenant audit view. Entries carry whatever
 * visibility the original action had, which is why an INTERNAL entry can still
 * appear here - an operator auditing the platform legitimately sees all of them.
 */
export default function AdminActivityPage(): JSX.Element {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [visibility, setVisibility] = useState<Visibility | ''>('');

  const search = useDebouncedValue(searchInput, 350);

  const { data, isLoading, error, reload } = useAsyncData(
    async (signal) => {
      const result = await adminService.listActivity({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        visibility: visibility || undefined,
        signal,
      } as Parameters<typeof adminService.listActivity>[0]);
      return result as unknown as PageMeta & { items: ActivityLogDto[] };
    },
    [page, search, visibility],
  );

  return (
    <>
      <PageHeader
        title="Platform activity"
        description="Audit trail across every tenant, newest first."
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Search by actor or event"
            className="flex-1"
            aria-label="Search activity"
          />
          <Select
            value={visibility}
            onChange={(event) => {
              setVisibility(event.target.value as Visibility | '');
              setPage(1);
            }}
            className="sm:w-48"
            aria-label="Filter by visibility"
          >
            <option value="">All visibility</option>
            {Object.values(VISIBILITY).map((value) => (
              <option key={value} value={value}>
                {value === 'CLIENT_VISIBLE' ? 'Client visible' : 'Internal'}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load activity" message={error.message} onRetry={reload} />
          </div>
        ) : isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Loading activity…</p>
        ) : !data?.items.length ? (
          <EmptyState title="No activity found" description="Adjust the filters to see more." />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {data.items.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{humanizeEvent(entry.eventType)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.actorName}
                      {entry.relatedEntityType ? ` · ${entry.relatedEntityType}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {entry.visibility === 'CLIENT_VISIBLE' ? (
                      <VisibilityBadge visibility={entry.visibility} />
                    ) : (
                      <Badge variant="neutral">Internal</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} />
          </>
        )}
      </Card>
    </>
  );
}