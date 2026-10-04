'use client';

import { useState } from 'react';
import { FolderKanban, Plus, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ProgressBar } from '@/components/progress-bar';
import { PriorityBadge, ProjectStatusBadge } from '@/components/status-badges';
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
import { useAction, useAsyncData, useDebouncedValue } from '@/hooks/use-async';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { workspaceService } from '@/services/workspace.service';
import type {
  CreateProjectInput,
  ProjectDto,
  ProjectListQuery,
} from '@/types/api';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  PROJECT_STATUS,
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
} from '@/types/enums';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 20;

interface ProjectFormState {
  name: string;
  description: string;
  clientId: string;
  startDate: string;
  expectedCompletionDate: string;
  status: ProjectStatus;
  priority: (typeof PRIORITIES)[keyof typeof PRIORITIES];
  projectManagerId: string;
}

const EMPTY_FORM: ProjectFormState = {
  name: '',
  description: '',
  clientId: '',
  startDate: '',
  expectedCompletionDate: '',
  status: 'ACTIVE',
  priority: 'MEDIUM',
  projectManagerId: '',
};

/**
 * Projects for the current tenant.
 *
 * Progress is rendered from `project.progress.progressPercentage`, which the
 * backend derives from completed tasks. There is no editable progress field
 * anywhere in this page by design.
 */
export default function WorkspaceProjectsPage(): JSX.Element {
  const toast = useToast();
  const { user } = useSession();
  const isAgencyAdmin = user?.role === 'AGENCY_ADMIN';

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const search = useDebouncedValue(searchInput, 350);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<ProjectFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query: ProjectListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => workspaceService.listProjects(query, signal),
    [page, search, status],
  );

  // Reference data for the form's selects.
  const clients = useAsyncData(
    (signal) => workspaceService.listClients({ page: 1, limit: 100 }, signal),
    [],
  );
  const team = useAsyncData(
    (signal) => workspaceService.listTeam({ page: 1, limit: 100, isActive: true }, signal),
    [],
  );

  const save = useAction(async () => {
    const payload: CreateProjectInput = {
      name: form.name,
      description: form.description || undefined,
      clientId: form.clientId,
      startDate: form.startDate,
      expectedCompletionDate: form.expectedCompletionDate || undefined,
      status: form.status,
      priority: form.priority,
      projectManagerId: form.projectManagerId || undefined,
    };
    if (editingId) return workspaceService.updateProject(editingId, payload);
    return workspaceService.createProject(payload);
  });

  const remove = useAction(async (id: string) => {
    await workspaceService.deleteProject(id);
  });

  const openCreate = (): void => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, startDate: new Date().toISOString().slice(0, 10) });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (project: ProjectDto): void => {
    setEditingId(project.id);
    setForm({
      name: project.name,
      description: project.description ?? '',
      clientId: project.clientId,
      startDate: project.startDate?.slice(0, 10) ?? '',
      expectedCompletionDate: project.expectedCompletionDate?.slice(0, 10) ?? '',
      status: project.status,
      priority: project.priority,
      projectManagerId: project.projectManagerId ?? '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    const result = await save.run();
    if (result === undefined) {
      setFormError(save.error?.message ?? 'The project could not be saved.');
      return;
    }
    setIsFormOpen(false);
    toast.success(editingId ? 'Project updated.' : 'Project created.');
    reload();
  };

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const result = await remove.run(pendingDelete.id);
    if (result === undefined) {
      toast.error('Could not delete the project', remove.error?.message);
      return;
    }
    setPendingDelete(null);
    toast.success('Project deleted.');
    reload();
  };
  const columns: Column<ProjectDto>[] = [
    {
      header: 'Project',
      cell: (project) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{project.name}</p>
          <p className="truncate text-xs text-muted-foreground">{project.client?.companyName ?? '—'}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (project) => <ProjectStatusBadge status={project.status} /> },
    { header: 'Priority', cell: (project) => <PriorityBadge priority={project.priority} /> },
    {
      header: 'Progress',
      cell: (project) => (
        <div className="w-32">
          <ProgressBar
            value={project.progress?.progressPercentage ?? 0}
            label={`${project.progress?.completedTasks ?? 0}/${project.progress?.totalTasks ?? 0} tasks`}
          />
        </div>
      ),
    },
    {
      header: 'Manager',
      cell: (project) => <span className="text-sm">{project.projectManager?.name ?? 'Unassigned'}</span>,
    },
    {
      header: 'Due',
      cell: (project) => (
        <span className="whitespace-nowrap text-sm">{formatDate(project.expectedCompletionDate)}</span>
      ),
    },
    {
      header: '',
      cell: (project) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(project)}>
            Edit
          </Button>
          {isAgencyAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setPendingDelete(project)}
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
        title="Projects"
        description="Progress is calculated from completed tasks, never entered by hand."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New project
          </Button>
        }
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
              placeholder="Search projects"
              className="pl-9"
              aria-label="Search projects"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProjectStatus | '');
              setPage(1);
            }}
            className="sm:w-44"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.values(PROJECT_STATUS).map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load projects" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(project) => project.id}
              isLoading={isLoading}
              caption="Projects"
              emptyState={
                <EmptyState
                  icon={FolderKanban}
                  title="No projects found"
                  description={search || status ? 'Adjust the filters.' : 'Create your first project to get started.'}
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
            <DialogTitle>{editingId ? 'Edit project' : 'New project'}</DialogTitle>
            <DialogDescription>
              The client and project manager must both belong to your agency.
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
            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-client">Client</Label>
              <Select
                id="project-client"
                value={form.clientId}
                onChange={(event) => setForm({ ...form, clientId: event.target.value })}
                required
              >
                <option value="">Select a client</option>
                {clients.data?.items.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project-start">Start date</Label>
                <Input
                  id="project-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-due">Expected completion</Label>
                <Input
                  id="project-due"
                  type="date"
                  value={form.expectedCompletionDate}
                  onChange={(event) => setForm({ ...form, expectedCompletionDate: event.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="project-status">Status</Label>
                <Select
                  id="project-status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as ProjectStatus })}
                >
                  {Object.values(PROJECT_STATUS).map((value) => (
                    <option key={value} value={value}>
                      {PROJECT_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-priority">Priority</Label>
                <Select
                  id="project-priority"
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value as ProjectFormState['priority'] })
                  }
                >
                  {Object.values(PRIORITIES).map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-manager">Project manager</Label>
                <Select
                  id="project-manager"
                  value={form.projectManagerId}
                  onChange={(event) => setForm({ ...form, projectManagerId: event.target.value })}
                >
                  <option value="">Unassigned</option>
                  {team.data?.items.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
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
                {editingId ? 'Save changes' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this project?"
        description={
          pendingDelete ? (
            <>
              <span className="font-medium">{pendingDelete.name}</span> and all of its milestones, tasks,
              meetings and feedback will be removed. This cannot be undone.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete project"
        destructive
        isPending={remove.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}