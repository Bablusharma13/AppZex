import { Types } from 'mongoose';
import { Task } from '../models/Task';
import { Project } from '../models/Project';
import { Milestone } from '../models/Milestone';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity, notify } from './activity.service';
import { EVENT_TYPES, TASK_STATUS } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface TaskCommentDto {
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface TaskDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  milestoneId: string | null;
  milestone?: { id: string; name: string } | null;
  title: string;
  description?: string;
  assigneeId: string | null;
  assignee?: { id: string; name: string } | null;
  createdBy: string;
  status: string;
  priority: string;
  dueDate?: Date;
  completedAt?: Date;
  isOverdue: boolean;
  comments: TaskCommentDto[];
  createdAt: Date;
  updatedAt: Date;
}

function toTaskDto(doc: Record<string, unknown>): TaskDto {
  const dueDate = doc.dueDate as Date | undefined;
  const project = doc.project as { _id: Types.ObjectId; name: string } | undefined;
  const milestone = doc.milestone as { _id: Types.ObjectId; name: string } | undefined;
  const assignee = doc.assignee as { _id: Types.ObjectId; name: string } | undefined;

  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    projectId: String(doc.projectId),
    project: project ? { id: String(project._id), name: project.name } : undefined,
    milestoneId: doc.milestoneId ? String(doc.milestoneId) : null,
    milestone: milestone ? { id: String(milestone._id), name: milestone.name } : null,
    title: doc.title as string,
    description: doc.description as string | undefined,
    assigneeId: doc.assigneeId ? String(doc.assigneeId) : null,
    assignee: assignee ? { id: String(assignee._id), name: assignee.name } : null,
    createdBy: String(doc.createdBy),
    status: doc.status as string,
    priority: doc.priority as string,
    dueDate,
    completedAt: doc.completedAt as Date | undefined,
    isOverdue: Boolean(dueDate) && doc.status !== TASK_STATUS.DONE && dueDate!.getTime() < Date.now(),
    comments: ((doc.comments as Record<string, unknown>[]) ?? []).map((c) => ({
      authorId: String(c.authorId),
      authorName: c.authorName as string,
      body: c.body as string,
      createdAt: c.createdAt as Date,
    })),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

/** Confirms the project exists inside the tenant. */
export async function requireProject(agencyId: string, projectId: string): Promise<void> {
  const exists = await Project.findOne({ _id: projectId, agencyId }).select('_id').lean().exec();
  if (!exists) throw AppError.badRequest('The selected project does not exist in your agency');
}

/**
 * Validates every cross-entity reference for a task.
 *
 * Each lookup is scoped by `agencyId`, which guarantees:
 *  - the project belongs to this tenant,
 *  - the milestone belongs to *that same project* (not merely the tenant),
 *  - the assignee is an active member of *this* agency.
 */
export async function validateRelations(
  agencyId: string,
  relations: { projectId: string; milestoneId?: string | null; assigneeId?: string | null },
): Promise<{ projectId: Types.ObjectId; milestoneId: Types.ObjectId | null; assigneeId: Types.ObjectId | null }> {
  const project = await Project.findOne({ _id: relations.projectId, agencyId }).select('_id').lean().exec();
  if (!project) throw AppError.badRequest('The selected project does not exist in your agency');

  let milestoneId: Types.ObjectId | null = null;
  if (relations.milestoneId) {
    const milestone = await Milestone.findOne({
      _id: relations.milestoneId,
      agencyId,
      projectId: relations.projectId, // must belong to the SAME project
    })
      .select('_id')
      .lean()
      .exec();
    if (!milestone) throw AppError.badRequest('The selected milestone does not belong to this project');
    milestoneId = milestone._id as Types.ObjectId;
  }

  let assigneeId: Types.ObjectId | null = null;
  if (relations.assigneeId) {
    const assignee = await User.findOne({
      _id: relations.assigneeId,
      agencyId,
      role: { $in: ['AGENCY_ADMIN', 'AGENCY_TEAM'] },
      isActive: true,
    })
      .select('_id')
      .lean()
      .exec();
    if (!assignee) throw AppError.badRequest('The selected assignee is not an active member of your agency');
    assigneeId = assignee._id as Types.ObjectId;
  }

  return { projectId: project._id as Types.ObjectId, milestoneId, assigneeId };
}

export interface ListTasksParams {
  page: number;
  limit: number;
  search?: string;
  projectId?: string;
  milestoneId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  overdue?: boolean;
  dueWithinDays?: number;
  sortBy: 'createdAt' | 'dueDate' | 'title' | 'status' | 'priority';
  sortOrder: 'asc' | 'desc';
}

export async function listTasks(actor: ActorContext, params: ListTasksParams): Promise<Paginated<TaskDto>> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };

  if (params.projectId) filter.projectId = params.projectId;
  if (params.milestoneId) filter.milestoneId = params.milestoneId;
  if (params.assigneeId) filter.assigneeId = params.assigneeId;
  if (params.status) filter.status = params.status;
  if (params.priority) filter.priority = params.priority;
  if (params.search) filter.title = new RegExp(escapeRegex(params.search), 'i');

  const now = new Date();
  if (params.overdue) {
    filter.dueDate = { $ne: null, $lt: now };
    filter.status = { $ne: TASK_STATUS.DONE };
  } else if (params.dueWithinDays) {
    const until = new Date();
    until.setDate(until.getDate() + params.dueWithinDays);
    filter.dueDate = { $ne: null, $lte: until };
  }

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Task.find(filter)
      .populate('project', 'name')
      .populate('milestone', 'name')
      .populate('assignee', 'name')
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Task.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toTaskDto(d as unknown as Record<string, unknown>));
  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<TaskDto>;
}

export interface CreateTaskInput {
  projectId: string;
  milestoneId?: string | null;
  title: string;
  description?: string;
  assigneeId?: string | null;
  priority: string;
  status: string;
  dueDate?: Date | null;
}

export async function createTask(actor: ActorContext, input: CreateTaskInput): Promise<TaskDto> {
  const rel = await validateRelations(actor.agencyId, input);

  const created = await Task.create({
    ...input,
    projectId: rel.projectId,
    milestoneId: rel.milestoneId,
    assigneeId: rel.assigneeId,
    agencyId: actor.agencyId, // server-derived, never from the payload
    createdBy: actor.userId,
    status: input.status ?? TASK_STATUS.TODO,
    completedAt: input.status === TASK_STATUS.DONE ? new Date() : undefined,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.TASK_CREATED,
    relatedEntityType: 'TASK',
    relatedEntityId: created._id,
    visibility: 'CLIENT_VISIBLE',
    metadata: { title: created.title, projectId: String(rel.projectId), supportSessionId: actor.supportSessionId },
  });

  if (rel.assigneeId && String(rel.assigneeId) !== actor.userId) {
    await notify({
      agencyId: actor.agencyId,
      recipientId: String(rel.assigneeId),
      type: 'TASK_ASSIGNED',
      title: 'New task assigned to you',
      body: created.title,
      link: `/workspace/tasks`,
    });
  }

  return toTaskDto(created.toObject() as unknown as Record<string, unknown>);
}

export async function getTaskById(actor: ActorContext, taskId: string): Promise<TaskDto> {
  const doc = await Task.findOne({ _id: taskId, agencyId: actor.agencyId })
    .populate('project', 'name')
    .populate('milestone', 'name')
    .populate('assignee', 'name')
    .lean()
    .exec();
  if (!doc) throw AppError.notFound('Task not found');
  return toTaskDto(doc as unknown as Record<string, unknown>);
}

export async function updateTask(
  actor: ActorContext,
  taskId: string,
  updates: Partial<Omit<CreateTaskInput, 'projectId'>>,
): Promise<TaskDto> {
  const existing = await Task.findOne({ _id: taskId, agencyId: actor.agencyId }).lean().exec();
  if (!existing) throw AppError.notFound('Task not found');

  const set: Record<string, unknown> = { ...updates };

  // Re-validate references against the task's own project when supplied.
  if (updates.milestoneId !== undefined || updates.assigneeId !== undefined) {
    const rel = await validateRelations(actor.agencyId, {
      projectId: String(existing.projectId),
      milestoneId: updates.milestoneId === undefined ? undefined : updates.milestoneId,
      assigneeId: updates.assigneeId === undefined ? undefined : updates.assigneeId,
    });
    if (updates.milestoneId !== undefined) set.milestoneId = rel.milestoneId;
    if (updates.assigneeId !== undefined) set.assigneeId = rel.assigneeId;
  }

  // Keep the completion timestamp consistent with the status.
  if (updates.status) {
    set.completedAt = updates.status === TASK_STATUS.DONE ? new Date() : null;
  }

  const updated = await Task.findOneAndUpdate(
    { _id: taskId, agencyId: actor.agencyId },
    { $set: set },
    { new: true, runValidators: true },
  )
    .populate('project', 'name')
    .populate('milestone', 'name')
    .populate('assignee', 'name')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Task not found');

  const completedNow = updates.status === TASK_STATUS.DONE && existing.status !== TASK_STATUS.DONE;
  const wasAssigned = updates.assigneeId !== undefined && String(updates.assigneeId) !== String(existing.assigneeId);

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: completedNow
      ? EVENT_TYPES.TASK_COMPLETED
      : wasAssigned
        ? EVENT_TYPES.TASK_ASSIGNED
        : EVENT_TYPES.TASK_UPDATED,
    relatedEntityType: 'TASK',
    relatedEntityId: taskId,
    visibility: 'CLIENT_VISIBLE',
    metadata: { fields: Object.keys(updates), supportSessionId: actor.supportSessionId },
  });

  if (wasAssigned && set.assigneeId) {
    await notify({
      agencyId: actor.agencyId,
      recipientId: String(set.assigneeId),
      type: 'TASK_ASSIGNED',
      title: 'Task assigned to you',
      body: updated.title,
      link: '/workspace/tasks',
    });
  }

  return toTaskDto(updated as unknown as Record<string, unknown>);
}

export async function deleteTask(actor: ActorContext, taskId: string): Promise<void> {
  const task = await Task.findOne({ _id: taskId, agencyId: actor.agencyId }).lean().exec();
  if (!task) throw AppError.notFound('Task not found');

  await Task.deleteOne({ _id: taskId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.TASK_DELETED,
    relatedEntityType: 'TASK',
    relatedEntityId: taskId,
    visibility: 'INTERNAL',
    metadata: { title: task.title },
  });
}

/** Appends a comment. Comments are internal notes on the task. */
export async function addTaskComment(actor: ActorContext, taskId: string, body: string): Promise<TaskDto> {
  const updated = await Task.findOneAndUpdate(
    { _id: taskId, agencyId: actor.agencyId },
    {
      $push: {
        comments: { authorId: actor.userId, authorName: actor.name, body, createdAt: new Date() },
      },
    },
    { new: true, runValidators: true },
  )
    .populate('project', 'name')
    .populate('milestone', 'name')
    .populate('assignee', 'name')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Task not found');

  return toTaskDto(updated as unknown as Record<string, unknown>);
}

/** Task counts grouped by status, used by the dashboard charts. */
export async function taskStatusBreakdown(agencyId: string): Promise<Record<string, number>> {
  const rows = await Task.aggregate<{ _id: string; count: number }>([
    { $match: { agencyId: new Types.ObjectId(agencyId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).exec();

  const breakdown: Record<string, number> = {
    [TASK_STATUS.TODO]: 0,
    [TASK_STATUS.IN_PROGRESS]: 0,
    [TASK_STATUS.REVIEW]: 0,
    [TASK_STATUS.DONE]: 0,
  };
  for (const row of rows) breakdown[row._id] = row.count;
  return breakdown;
}