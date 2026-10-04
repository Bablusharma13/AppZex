'use client';

import { useState } from 'react';
import { Plus, Target } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { MilestoneStatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { useAction, useAsyncData } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { workspaceService } from '@/services/workspace.service';
import type { CreateMilestoneInput, MilestoneDto, MilestoneListQuery } from '@/types/api';
import {
  MILESTONE_STATUS,
  MILESTONE_STATUS_LABELS,
  type MilestoneStatus,
} from '@/types/enums';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

interface MilestoneFormState {
  projectId: string;
  name: string;
  description: string;
  status: MilestoneStatus;
  dueDate: string;
  order: string;
}

const EMPTY_FORM: MilestoneFormState = {
  projectId: '',
  name: '',
  description: '',
  status: 'PENDING',
  dueDate: '',
  order: '',
};

/** Milestones across the tenant, ordered by their `order` field. */
export default function WorkspaceMilestonesPage(): JSX.Element {
  const toast = useToast();
  const { user } = useSession();
  const isAgencyAdmin = user?.role === 'AGENCY_ADMIN';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<MilestoneStatus | ''>('');
  const [projectId, setProjectId] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<MilestoneFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MilestoneDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query: MilestoneListQuery = {
    page,
    limit: PAGE_SIZE,
    status: status || undefined,
    projectId: projectId || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => workspaceService.listMilestones(query, signal),
    [page, status, projectId],
  );

  const projects = useAsyncData(
    (signal) => workspaceService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );

  const save = useAction(async () => {
    const payload: CreateMilestoneInput = {
      projectId: form.projectId,
      name: form.name,
      description: form.description || undefined,
      status: form.status,
      dueDate: form.dueDate || undefined,
      order: form.order ? Number(form.order) : undefined,
    };
    if (editingId) return workspaceService.updateMilestone(editingId, payload);
    return workspaceService.createMilestone(payload);
  });

  const remove = useAction(async (id: string) => {
    await workspaceService.deleteMilestone(id);
  });

  const openCreate = (): void => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, projectId });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (milestone: MilestoneDto): void => {
    setEditingId(milestone.id);
    setForm({
      projectId: milestone.projectId,
      name: milestone.name,
      description: milestone.description ?? '',
      status: milestone.status,
      dueDate: milestone.dueDate?.slice(0, 10) ?? '',
      order: String(milestone.order ?? ''),
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    const result = await save.run();
    if (result === undefined) {
      setFormError(save.error?.message ?? 'The milestone could not be saved.');
      return;
    }
    setIsFormOpen(false);
    toast.success(editingId ? 'Milestone updated.' : 'Milestone created.');
    reload();
  };

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const result = await remove.run(pendingDelete.id);
    if (result === undefined) {
      toast.error('Could not delete the milestone', remove.error?.message);
      return;
    }
    setPendingDelete(null);
    toast.success('Milestone deleted.');
    reload();
  };
  const columns: Column<MilestoneDto>[] = [
    {
      header: 'Milestone',
      cell: (milestone) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{milestone.name}</p>
          <p className="truncate text-xs text-muted-foreground">{milestone.project?.name ?? '—'}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (milestone) => <MilestoneStatusBadge status={milestone.status} /> },
    {
      header: 'Order',
      cell: (milestone) => <span className="tabular-nums text-sm">{milestone.order}</span>,
      className: 'text-right',
    },
    {
      header: 'Tasks',
      cell: (milestone) => (
        <span className="tabular-nums text-sm">
          {milestone.completedTaskCount ?? 0}/{milestone.taskCount ?? 0}
        </span>
      ),
      className: 'text-right',
    },
    {
      header: 'Due',
      cell: (milestone) => (
        <span className="whitespace-nowrap text-sm">{formatDate(milestone.dueDate)}</span>
      ),
    },
    {
      header: '',
      cell: (milestone) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(milestone)}>
            Edit
          </Button>
          {isAgencyAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setPendingDelete(milestone)}
            >
              Delete
            </Button>
          ) : null}
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <>
      <PageHeader
        title="Milestones"
        description="Phases within a project, ordered to reflect your delivery plan."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New milestone
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPage(1);
            }}
            className="sm:w-56"
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.data?.items.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as MilestoneStatus | '');
              setPage(1);
            }}
            className="sm:w-44"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.values(MILESTONE_STATUS).map((value) => (
              <option key={value} value={value}>
                {MILESTONE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load milestones" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(milestone) => milestone.id}
              isLoading={isLoading}
              caption="Milestones"
              emptyState={
                <EmptyState
                  icon={Target}
                  title="No milestones found"
                  description={status || projectId ? 'Adjust the filters.' : 'Add milestones to break projects into phases.'}
                />
              }
            />
            {data ? <Pagination pagination={data} onPageChange={setPage} isLoading={isLoading} /> : null}
          </>
        )}
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit milestone' : 'New milestone'}</DialogTitle>
            <DialogDescription>The project must belong to your agency.</DialogDescription>
          </DialogHeader>

          {formError ? <InlineAlert message={formError} /> : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="milestone-project">Project</Label>
              <Select
                id="milestone-project"
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

            <div className="space-y-2">
              <Label htmlFor="milestone-name">Name</Label>
              <Input
                id="milestone-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Design, Development, Launch…"
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="milestone-status">Status</Label>
                <Select
                  id="milestone-status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as MilestoneStatus })}
                >
                  {Object.values(MILESTONE_STATUS).map((value) => (
                    <option key={value} value={value}>
                      {MILESTONE_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="milestone-due">Due date</Label>
                <Input
                  id="milestone-due"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="milestone-order">Order</Label>
                <Input
                  id="milestone-order"
                  type="number"
                  min={0}
                  value={form.order}
                  onChange={(event) => setForm({ ...form, order: event.target.value })}
                  placeholder="1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="milestone-description">Description</Label>
              <Textarea
                id="milestone-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={save.isPending}>
                {editingId ? 'Save changes' : 'Create milestone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this milestone?"
        description={
          pendingDelete ? (
            <>
              <span className="font-medium">{pendingDelete.name}</span> will be removed. Its tasks are kept but
              become unassigned from a milestone.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete milestone"
        destructive
        isPending={remove.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}