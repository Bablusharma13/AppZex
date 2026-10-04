'use client';

import { useState } from 'react';
import { Search, UserPlus } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Avatar } from '@/components/avatar';
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
import { Input, Label, Select } from '@/components/ui/input';
import { useAction, useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { workspaceService } from '@/services/workspace.service';
import type { CreateTeamMemberInput, TeamMemberDto, TeamListQuery } from '@/types/api';
import { ROLE_LABELS, type Role } from '@/types/enums';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

interface TeamFormState {
  name: string;
  email: string;
  password: string;
  role: 'AGENCY_ADMIN' | 'AGENCY_TEAM';
  jobTitle: string;
  phone: string;
}

const EMPTY_FORM: TeamFormState = {
  name: '',
  email: '',
  password: '',
  role: 'AGENCY_TEAM',
  jobTitle: '',
  phone: '',
};

/**
 * Team members for the current agency.
 *
 * There is no agency field in the create payload: the server attaches the
 * signed-in admin's agency, so a new member cannot be placed in another tenant.
 */
export default function WorkspaceTeamPage(): JSX.Element {
  const toast = useToast();
  const { user } = useSession();
  const isAgencyAdmin = user?.role === 'AGENCY_ADMIN';

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 350);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query: TeamListQuery = { page, limit: PAGE_SIZE, search: search || undefined };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => workspaceService.listTeam(query, signal),
    [page, search],
  );

  const save = useAction(async () => {
    if (editingId) {
      // Email is immutable here; role, name and activation are editable.
      return workspaceService.updateTeamMember(editingId, {
        name: form.name,
        role: form.role,
        jobTitle: form.jobTitle || undefined,
        phone: form.phone || undefined,
      });
    }
    const payload: CreateTeamMemberInput = {
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      jobTitle: form.jobTitle || undefined,
      phone: form.phone || undefined,
    };
    return workspaceService.createTeamMember(payload);
  });

  const toggleActive = useAction(async (member: TeamMemberDto) => {
    await workspaceService.updateTeamMember(member.id, { isActive: !member.isActive });
  });

  const openCreate = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (member: TeamMemberDto): void => {
    setEditingId(member.id);
    setForm({
      name: member.name,
      email: member.email,
      password: '',
      role: member.role === 'AGENCY_ADMIN' ? 'AGENCY_ADMIN' : 'AGENCY_TEAM',
      jobTitle: member.jobTitle ?? '',
      phone: member.phone ?? '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    const result = await save.run();
    if (result === undefined) {
      setFormError(save.error?.message ?? 'The team member could not be saved.');
      return;
    }
    setIsFormOpen(false);
    toast.success(editingId ? 'Team member updated.' : 'Team member added.');
    reload();
  };

  const handleToggleActive = async (member: TeamMemberDto): Promise<void> => {
    const result = await toggleActive.run(member);
    if (result === undefined) {
      toast.error('Could not update the member', toggleActive.error?.message);
      return;
    }
    toast.success(member.isActive ? 'Member deactivated.' : 'Member activated.');
    reload();
  };
  const columns: Column<TeamMemberDto>[] = [
    {
      header: 'Member',
      cell: (member) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={member.name} />
          <div className="min-w-0">
            <p className="truncate font-medium">{member.name}</p>
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      cell: (member) => (
        <Badge variant={member.role === 'AGENCY_ADMIN' ? 'info' : 'neutral'}>
          {ROLE_LABELS[member.role as Role]}
        </Badge>
      ),
    },
    {
      header: 'Job title',
      cell: (member) => <span className="text-sm">{member.jobTitle ?? '—'}</span>,
    },
    {
      header: 'Projects',
      cell: (member) => (
        <span className="tabular-nums text-sm">{member.assignedProjectCount}</span>
      ),
      className: 'text-right',
    },
    {
      header: 'Status',
      cell: (member) => (
        <Badge variant={member.isActive ? 'success' : 'neutral'}>
          {member.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      header: 'Joined',
      cell: (member) => <span className="whitespace-nowrap text-sm">{formatDate(member.createdAt)}</span>,
    },
    ...(isAgencyAdmin
      ? [
          {
            header: '',
            cell: (member: TeamMemberDto) => (
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(member)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleToggleActive(member)}
                  isLoading={toggleActive.isPending}
                >
                  {member.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            ),
            className: 'text-right',
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Team"
        description="People in your agency. Members can only be assigned to your own projects."
        actions={
          isAgencyAdmin ? (
            <Button onClick={openCreate}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add member
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="border-b border-border p-4">
          <div className="relative">
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
              placeholder="Search by name or email"
              className="pl-9"
              aria-label="Search team members"
            />
          </div>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load the team" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(member) => member.id}
              isLoading={isLoading}
              caption="Team members"
              emptyState={<EmptyState title="No team members found" />}
            />
            {data ? <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} /> : null}
          </>
        )}
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit team member' : 'Add team member'}</DialogTitle>
            <DialogDescription>
              The new account is created inside your agency with the role you choose.
            </DialogDescription>
          </DialogHeader>

          {formError ? <InlineAlert message={formError} /> : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-name">Full name</Label>
                <Input
                  id="member-name"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-email">Work email</Label>
                <Input
                  id="member-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  disabled={Boolean(editingId)}
                  required
                />
              </div>
            </div>

            {!editingId ? (
              <div className="space-y-2">
                <Label htmlFor="member-password">Temporary password</Label>
                <Input
                  id="member-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters. The member should change it after signing in.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="member-role">Role</Label>
                <Select
                  id="member-role"
                  value={form.role}
                  onChange={(event) =>
                    setForm({ ...form, role: event.target.value as TeamFormState['role'] })
                  }
                >
                  <option value="AGENCY_TEAM">Agency team</option>
                  <option value="AGENCY_ADMIN">Agency admin</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-title">Job title</Label>
                <Input
                  id="member-title"
                  value={form.jobTitle}
                  onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-phone">Phone</Label>
                <Input
                  id="member-phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={save.isPending}>
                {editingId ? 'Save changes' : 'Add member'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}