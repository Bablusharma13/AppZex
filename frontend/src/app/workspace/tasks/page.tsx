'use client';

import { useState } from 'react';
import { CheckSquare, Plus, Search } from 'lucide-react';

import { DataTable, type Column } from '@/components/data-table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/feedback-states';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { PriorityBadge, TaskStatusBadge } from '@/components/status-badges';
import { Badge } from '@/components/ui/badge';
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
import { workspaceService } from '@/services/workspace.service';
import type { CreateTaskInput, TaskDto, TaskListQuery } from '@/types/api';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  type Priority,
  type TaskStatus,
} from '@/types/enums';
import { formatDate, isPast } from '@/utils/format';

const PAGE_SIZE = 20;

interface TaskFormState {
  title: string;
  description: string;
  projectId: string;
  milestoneId: string;
  assigneeId: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
}

const EMPTY_FORM: TaskFormState = {
  title: '',
  description: '',
  projectId: '',
  milestoneId: '',
  assigneeId: '',
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: '',
};

/**
 * Task board for the current tenant.
 *
 * Creating a task updates project progress implicitly, because the backend
 * recomputes the percentage from the task collection on every read.
 */
export default function WorkspaceTasksPage(): JSX.Element {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [projectId, setProjectId] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const search = useDebouncedValue(searchInput, 350);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TaskDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query: TaskListQuery = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    status: status || undefined,
    projectId: projectId || undefined,
    overdue: overdueOnly || undefined,
  };

  const { data, isLoading, error, reload } = useAsyncData(
    (signal) => workspaceService.listTasks(query, signal),
    [page, search, status, projectId, overdueOnly],
  );

  const projects = useAsyncData(
    (signal) => workspaceService.listProjects({ page: 1, limit: 100 }, signal),
    [],
  );
  const milestones = useAsyncData(
    (signal) =>
      workspaceService.listMilestones(
        { page: 1, limit: 100, projectId: form.projectId || undefined },
        signal,
      ),
    [form.projectId],
  );
  const team = useAsyncData(
    (signal) => workspaceService.listTeam({ page: 1, limit: 100, isActive: true }, signal),
    [],
  );

  const save = useAction(async () => {
    const payload: CreateTaskInput = {
      title: form.title,
      description: form.description || undefined,
      projectId: form.projectId,
      milestoneId: form.milestoneId || null,
      assigneeId: form.assigneeId || null,
      status: form.status,
      priority: form.priority,
      dueDate: form.dueDate || null,
    };
    if (editingId) return workspaceService.updateTask(editingId, payload);
    return workspaceService.createTask(payload);
  });

  const remove = useAction(async (id: string) => {
    await workspaceService.deleteTask(id);
  });

  const openCreate = (): void => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, projectId });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (task: TaskDto): void => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? '',
      projectId: task.projectId,
      milestoneId: task.milestoneId ?? '',
      assigneeId: task.assigneeId ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate?.slice(0, 10) ?? '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (): Promise<void> => {
    setFormError(null);
    const result = await save.run();
    if (result === undefined) {
      setFormError(save.error?.message ?? 'The task could not be saved.');
      return;
    }
    setIsFormOpen(false);
    toast.success(editingId ? 'Task updated.' : 'Task created.');
    reload();
  };

  const handleDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const result = await remove.run(pendingDelete.id);
    if (result === undefined) {
      toast.error('Could not delete the task', remove.error?.message);
      return;
    }
    setPendingDelete(null);
    toast.success('Task deleted.');
    reload();
  };
  const columns: Column<TaskDto>[] = [
    {
      header: 'Task',
      cell: (task) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{task.title}</p>
          <p className="truncate text-xs text-muted-foreground">{task.project?.name ?? '—'}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (task) => <TaskStatusBadge status={task.status} /> },
    { header: 'Priority', cell: (task) => <PriorityBadge priority={task.priority} /> },
    {
      header: 'Assignee',
      cell: (task) => <span className="text-sm">{task.assignee?.name ?? 'Unassigned'}</span>,
    },
    {
      header: 'Due',
      cell: (task) => (
        <span className="whitespace-nowrap text-sm">
          {formatDate(task.dueDate)}
          {task.isOverdue ? (
            <Badge variant="danger" className="ml-2">
              Overdue
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      header: '',
      cell: (task) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(task)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setPendingDelete(task)}
          >
            Delete
          </Button>
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Delivery work across your projects. Completing tasks drives project progress."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New task
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
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
              placeholder="Search tasks"
              className="pl-9"
              aria-label="Search tasks"
            />
          </div>
          <Select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setPage(1);
            }}
            className="lg:w-52"
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
              setStatus(event.target.value as TaskStatus | '');
              setPage(1);
            }}
            className="lg:w-40"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {Object.values(TASK_STATUS).map((value) => (
              <option key={value} value={value}>
                {TASK_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => {
                setOverdueOnly(event.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-input"
            />
            Overdue only
          </label>
        </div>

        {error ? (
          <div className="p-4">
            <ErrorState title="Could not load tasks" message={error.message} onRetry={reload} />
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={data?.items ?? []}
              rowKey={(task) => task.id}
              isLoading={isLoading}
              caption="Tasks"
              emptyState={
                <EmptyState
                  icon={CheckSquare}
                  title="No tasks found"
                  description={search || status || projectId ? 'Adjust the filters.' : 'Create your first task.'}
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
            <DialogTitle>{editingId ? 'Edit task' : 'New task'}</DialogTitle>
            <DialogDescription>
              The project, milestone and assignee must all belong to your agency.
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
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task-project">Project</Label>
                <Select
                  id="task-project"
                  value={form.projectId}
                  onChange={(event) => setForm({ ...form, projectId: event.target.value, milestoneId: '' })}
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
                <Label htmlFor="task-milestone">Milestone</Label>
                <Select
                  id="task-milestone"
                  value={form.milestoneId}
                  onChange={(event) => setForm({ ...form, milestoneId: event.target.value })}
                  disabled={!form.projectId}
                >
                  <option value="">No milestone</option>
                  {milestones.data?.items.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="task-assignee">Assignee</Label>
                <Select
                  id="task-assignee"
                  value={form.assigneeId}
                  onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}
                >
                  <option value="">Unassigned</option>
                  {team.data?.items.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-status">Status</Label>
                <Select
                  id="task-status"
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
                >
                  {Object.values(TASK_STATUS).map((value) => (
                    <option key={value} value={value}>
                      {TASK_STATUS_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-priority">Priority</Label>
                <Select
                  id="task-priority"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}
                >
                  {Object.values(PRIORITIES).map((value) => (
                    <option key={value} value={value}>
                      {PRIORITY_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
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
                {editingId ? 'Save changes' : 'Create task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this task?"
        description={
          pendingDelete ? (
            <>
              <span className="font-medium">{pendingDelete.title}</span> will be removed and project progress
              will be recalculated.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete task"
        destructive
        isPending={remove.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}