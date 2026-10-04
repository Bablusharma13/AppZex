'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { AgencyStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { adminService } from '@/services/auth.service';
import { formatDate } from '@/utils/format';
import {
  AGENCY_STATUS,
  AGENCY_STATUS_LABELS,
  PLANS,
  type AgencyStatus,
  type Plan,
} from '@/types/enums';
import type { AgencySummary } from '@/types/api';

const PAGE_SIZE = 20;

export default function AdminAgenciesPage(): JSX.Element {
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<AgencyStatus | ''>('');
  const [plan, setPlan] = useState<Plan | ''>('');

  // Debounced so typing does not fire a request per keystroke.
  const search = useDebouncedValue(searchInput, 350);

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) =>
      adminService.listAgencies({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        plan: plan || undefined,
        signal,
      }),
    [page, search, status, plan],
  );

  const columns: Column<AgencySummary>[] = [
    {
      header: 'Agency',
      cell: (agency) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{agency.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agency.ownerName}</p>
        </div>
      ),
    },
    { header: 'Contact', cell: (agency) => <span className="text-sm">{agency.email}</span> },
    { header: 'Status', cell: (agency) => <AgencyStatusBadge status={agency.status} /> },
    { header: 'Plan', cell: (agency) => <span className="text-sm">{agency.plan}</span> },
    {
      header: 'Users',
      cell: (agency) => <span className="tabular-nums">{agency.userCount}</span>,
      className: 'text-right',
    },
    {
      header: 'Clients',
      cell: (agency) => <span className="tabular-nums">{agency.clientCount}</span>,
      className: 'text-right',
    },
    {
      header: 'Projects',
      cell: (agency) => <span className="tabular-nums">{agency.projectCount}</span>,
      className: 'text-right',
    },
    {
      header: 'Created',
      cell: (agency) => (
        <span className="whitespace-nowrap text-sm">{formatDate(agency.createdAt)}</span>
      ),
    },
  ];
return (
    <>
      <PageHeader
        title="Agencies"
        description="Every tenant on the platform. Select an agency to manage it or enter support mode."
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
              placeholder="Search by name, owner or email"
              className="pl-9"
              aria-label="Search agencies"
            />
          </div>

          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AgencyStatus | '');
              setPage(1);
            }}
            aria-label="Filter by status"
            className="sm:w-44"
          >
            <option value="">All statuses</option>
            {Object.values(AGENCY_STATUS).map((value) => (
              <option key={value} value={value}>
                {AGENCY_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>

          <Select
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value as Plan | '');
              setPage(1);
            }}
            aria-label="Filter by plan"
            className="sm:w-44"
          >
            <option value="">All plans</option>
            {Object.values(PLANS).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load agencies" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(agency) => agency.id}
              isLoading={isLoading}
              caption="Platform agencies"
              onRowClick={(agency) => router.push(`/admin/agencies/${agency.id}`)}
              emptyState={
                <EmptyState
                  icon={Building2}
                  title="No agencies found"
                  description="Adjust the search or filters to find a tenant."
                />
              }
            />
            {data ? (
              <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} />
            ) : null}
          </>
        )}
      </Card>

      {status || plan || search ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('');
              setStatus('');
              setPlan('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : null}
    </>
  );
}