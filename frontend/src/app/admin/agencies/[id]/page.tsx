'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Briefcase, FolderKanban, Mail, Phone, Users } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback-states';
import { Breadcrumbs, PageHeader, StatCard } from '@/components/page-header';
import { StartSupportDialog } from '@/components/start-support-dialog';
import { AgencyStatusBadge, ProjectStatusBadge } from '@/components/status-badges';
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
import { useAsyncData, useAction } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { adminService } from '@/services/auth.service';
import { formatDate, formatDateTime, humanizeEvent } from '@/utils/format';
import {
  AGENCY_STATUS,
  AGENCY_STATUS_LABELS,
  ROLE_LABELS,
  type AgencyStatus,
  type Role,
} from '@/types/enums';

export default function AgencyDetailPage(): JSX.Element {
  const params = useParams<{ id: string }>();
  const toast = useToast();

  const agencyId = params.id;
  const [isSupportDialogOpen, setIsSupportDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<AgencyStatus | null>(null);

  const { data, isLoading, error, reload } = useAsyncData(
    () => adminService.getAgencyDetail(agencyId),
    [agencyId],
  );

  const changeStatus = useAction(async (status: AgencyStatus) => {
    await adminService.setAgencyStatus(agencyId, status);
  });

  const handleStatusChange = async (status: AgencyStatus): Promise<void> => {
    setPendingStatus(null);
    const result = await changeStatus.run(status);
    if (result !== undefined || !changeStatus.error) {
      toast.success(`Agency set to ${AGENCY_STATUS_LABELS[status]}.`);
      reload();
      return;
    }
    toast.error('Could not change the agency status', changeStatus.error?.message);
  };

  if (error) {
    return (
      <>
        <PageHeader title="Agency" />
        <ErrorState title="Could not load this agency" message={error.message} onRetry={reload} />
      </>
    );
  }

  const agency = data?.agency;

  return (
    <>
      <PageHeader title={agency?.name ?? 'Agency'} description={agency?.ownerName} />

      {agency ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Users" value={agency.userCount} icon={Users} />
          <StatCard label="Client companies" value={agency.clientCount} icon={Briefcase} />
          <StatCard label="Projects" value={agency.projectCount} icon={FolderKanban} />
          <StatCard label="Plan" value={agency.plan} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Agency</CardTitle>
            <AgencyStatusBadge status={agency?.status ?? 'ACTIVE'} />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {agency?.email ?? '—'}
            </p>
            {agency?.phone ? (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {agency.phone}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">Created {formatDate(agency?.createdAt)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administrative actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => setIsSupportDialogOpen(true)}>
              Enter support mode
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setPendingStatus(agency?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}
              isLoading={changeStatus.isPending}
            >
              {agency?.status === 'ACTIVE' ? 'Suspend agency' : 'Activate agency'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({data?.users.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.users.length ? (
            <EmptyState title="No users in this agency" />
          ) : (
            <ul className="divide-y divide-border">
              {data.users.map((user) => (
                <li key={user._id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={user.isActive ? 'success' : 'neutral'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    <Badge variant="neutral">{ROLE_LABELS[user.role as Role]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clients ({data?.clients.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.clients.length ? (
            <EmptyState title="No client companies" />
          ) : (
            <ul className="divide-y divide-border">
              {data.clients.map((client) => (
                <li key={client._id} className="py-2.5">
                  <p className="text-sm font-medium">{client.companyName}</p>
                  <p className="text-xs text-muted-foreground">
                    {client.contactPerson} · {client.email}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projects ({data?.projects.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.projects.length ? (
            <EmptyState title="No projects" />
          ) : (
            <ul className="divide-y divide-border">
              {data.projects.map((project) => (
                <li key={project._id} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Due {formatDate(project.expectedCompletionDate)}
                    </p>
                  </div>
                  <ProjectStatusBadge status={project.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <StartSupportDialog
        open={isSupportDialogOpen}
        onOpenChange={setIsSupportDialogOpen}
        agencyId={agencyId}
        agencyName={agency?.name ?? 'this agency'}
        onStarted={reload}
      />

      {/* Suspension blocks every agency user, so it is always confirmed first. */}
      <Dialog open={pendingStatus !== null} onOpenChange={(open) => !open && setPendingStatus(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>
              {pendingStatus === 'SUSPENDED' ? 'Suspend this agency?' : 'Reactivate this agency?'}
            </DialogTitle>
            <DialogDescription>
              {pendingStatus === 'SUSPENDED'
                ? 'Every user of this agency will be blocked from the workspace until it is reactivated. This is recorded in the activity log.'
                : 'Users of this agency will be able to sign in and use the workspace again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingStatus(null)} disabled={changeStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={pendingStatus === 'SUSPENDED' ? 'destructive' : 'default'}
              isLoading={changeStatus.isPending}
              onClick={() => {
                if (pendingStatus) void handleStatusChange(pendingStatus);
              }}
            >
              {pendingStatus === 'SUSPENDED' ? 'Suspend agency' : 'Activate agency'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}