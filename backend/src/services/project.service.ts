import { Types } from 'mongoose';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Milestone } from '../models/Milestone';
import { Meeting } from '../models/Meeting';
import { Feedback } from '../models/Feedback';
import { Client } from '../models/Client';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity, notify } from './activity.service';
import { EMPTY_PROGRESS, computeProgress, type ProgressStats } from './progress.service';
import { EVENT_TYPES, PROJECT_STATUS } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface ProjectDto {
  id: string;
  agencyId: string;
  clientId: string;
  client?: { id: string; companyName: string };
  projectManager?: { id: string; name: string; email: string } | null;
  name: string;
  description?: string;
  status: string;
  priority: string;
  startDate: Date;
  expectedCompletionDate?: Date;
  projectManagerId: string | null;
  budget?: number;
  progress: ProgressStats;
  createdAt: Date;
  updatedAt: Date;
}

/** Populates a DTO from a lean project document plus its derived progress. */
export function toProjectDto(doc: Record<string, unknown>, progress?: ProgressStats): ProjectDto {
  const client = doc.client as { _id: Types.ObjectId; companyName: string } | undefined;
  const manager = doc.projectManager as { _id: Types.ObjectId; name: string; email: string } | undefined;

  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    clientId: String(doc.clientId),
    client: client ? { id: String(client._id), companyName: client.companyName } : undefined,
    projectManager: manager ? { id: String(manager._id), name: manager.name, email: manager.email } : null,
    name: doc.name as string,
    description: doc.description as string | undefined,
    status: doc.status as string,
    priority: doc.priority as string,
    startDate: doc.startDate as Date,
    expectedCompletionDate: doc.expectedCompletionDate as Date | undefined,
    projectManagerId: doc.projectManagerId ? String(doc.projectManagerId) : null,
    budget: doc.budget as number | undefined,
    progress: progress ?? EMPTY_PROGRESS,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

/**
 * Confirms the project manager belongs to the *same* agency and is agency staff.
 * Cross-agency assignment is impossible because `agencyId` is part of the filter.
 */
export async function resolveProjectManager(
  agencyId: string,
  projectManagerId?: string | null,
): Promise<Types.ObjectId | null> {
  if (!projectManagerId) return null;

  const manager = await User.findOne({
    _id: projectManagerId,
    agencyId,
    role: { $in: ['AGENCY_ADMIN', 'AGENCY_TEAM'] },
    isActive: true,
  })
    .select('_id')
    .lean()
    .exec();

  if (!manager) {
    throw AppError.badRequest('The selected project manager is not an active member of your agency');
  }
  return manager._id as Types.ObjectId;
}

/** Confirms the client belongs to the same agency. */
export async function resolveClient(agencyId: string, clientId: string): Promise<Types.ObjectId> {
  const client = await Client.findOne({ _id: clientId, agencyId }).select('_id').lean().exec();
  if (!client) throw AppError.badRequest('The selected client does not exist in your agency');
  return client._id as Types.ObjectId;
}

export interface ListProjectsParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  priority?: string;
  clientId?: string;
  projectManagerId?: string;
  dueWithinDays?: number;
  sortBy: 'createdAt' | 'updatedAt' | 'name' | 'expectedCompletionDate' | 'status';
  sortOrder: 'asc' | 'desc';
}

/**
 * Lists projects for the tenant derived from the actor context.
 *
 * `clientId` scope is applied when the actor is a client account, which is what
 * stops Client 1 from seeing Client 2's projects even if they guess the id.
 */
export async function listProjects(
  actor: ActorContext & { clientId?: string },
  params: ListProjectsParams,
): Promise<Paginated<ProjectDto>> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };

  if (actor.clientId) filter.clientId = actor.clientId;
  else if (params.clientId) filter.clientId = params.clientId;

  if (params.status) filter.status = params.status;
  if (params.priority) filter.priority = params.priority;
  if (params.projectManagerId) filter.projectManagerId = params.projectManagerId;

  if (params.dueWithinDays) {
    const until = new Date();
    until.setDate(until.getDate() + params.dueWithinDays);
    filter.expectedCompletionDate = { $ne: null, $lte: until };
  }

  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Project.find(filter)
      .populate('client', 'companyName')
      .populate('projectManager', 'name email')
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Project.countDocuments(filter).exec(),
  ]);

  const progressMap = await computeProgress(
    actor.agencyId,
    docs.map((d) => d._id as Types.ObjectId),
  );

  const items = docs.map((doc) =>
    toProjectDto(doc as unknown as Record<string, unknown>, progressMap.get(String(doc._id))),
  );

  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<ProjectDto>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  clientId: string;
  startDate: Date;
  expectedCompletionDate?: Date;
  status: string;
  priority: string;
  projectManagerId?: string;
  budget?: number;
}

export async function createProject(actor: ActorContext, input: CreateProjectInput): Promise<ProjectDto> {
  // Both foreign keys are validated against the tenant before the write.
  const clientId = await resolveClient(actor.agencyId, input.clientId);
  const projectManagerId = await resolveProjectManager(actor.agencyId, input.projectManagerId);

  const created = await Project.create({
    ...input,
    agencyId: actor.agencyId, // never taken from the request body
    clientId,
    projectManagerId,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.PROJECT_CREATED,
    relatedEntityType: 'PROJECT',
    relatedEntityId: created._id,
    visibility: 'CLIENT_VISIBLE',
    metadata: { name: created.name, priority: created.priority, supportSessionId: actor.supportSessionId },
  });

  if (projectManagerId && String(projectManagerId) !== actor.userId) {
    await notify({
      agencyId: actor.agencyId,
      recipientId: String(projectManagerId),
      type: 'PROJECT_ASSIGNED',
      title: 'You have been assigned to a project',
      body: created.name,
      link: `/workspace/projects/${created._id}`,
    });
  }

  const populated = await Project.findById(created._id)
    .populate('client', 'companyName')
    .populate('projectManager', 'name email')
    .lean()
    .exec();

  return toProjectDto(populated as unknown as Record<string, unknown>, EMPTY_PROGRESS);
}

/**
 * Loads a project within the tenant.
 *
 * When `clientId` is supplied the query additionally requires the project to
 * belong to that client company - this is the IDOR guard for client accounts.
 */
export async function getProjectById(
  actor: ActorContext & { clientId?: string },
  projectId: string,
): Promise<ProjectDto> {
  const filter: Record<string, unknown> = { _id: projectId, agencyId: actor.agencyId };
  if (actor.clientId) filter.clientId = actor.clientId;

  const doc = await Project.findOne(filter)
    .populate('client', 'companyName')
    .populate('projectManager', 'name email')
    .lean()
    .exec();

  // 404 for both "missing" and "belongs to someone else": no information leak.
  if (!doc) throw AppError.notFound('Project not found');

  const progress = await computeProgress(actor.agencyId, [doc._id as Types.ObjectId]);
  return toProjectDto(doc as unknown as Record<string, unknown>, progress.get(String(doc._id)));
}

export async function updateProject(
  actor: ActorContext,
  projectId: string,
  updates: Partial<CreateProjectInput>,
): Promise<ProjectDto> {
  const set: Record<string, unknown> = { ...updates };

  if (updates.clientId) set.clientId = await resolveClient(actor.agencyId, updates.clientId);
  if (updates.projectManagerId !== undefined) {
    set.projectManagerId = await resolveProjectManager(actor.agencyId, updates.projectManagerId);
  }

  // Validate the date pair against the merged view, not just the payload.
  if (set.startDate || set.expectedCompletionDate) {
    const current = await Project.findOne({ _id: projectId, agencyId: actor.agencyId }).lean().exec();
    if (!current) throw AppError.notFound('Project not found');

    const start = (set.startDate as Date | undefined) ?? current.startDate;
    const end = (set.expectedCompletionDate as Date | undefined) ?? current.expectedCompletionDate;
    if (start && end && end.getTime() < start.getTime()) {
      throw AppError.badRequest('Expected completion date must be on or after the start date');
    }
  }

  const updated = await Project.findOneAndUpdate(
    { _id: projectId, agencyId: actor.agencyId },
    { $set: set },
    { new: true, runValidators: true },
  )
    .populate('client', 'companyName')
    .populate('projectManager', 'name email')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Project not found');

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: updates.status === PROJECT_STATUS.COMPLETED
      ? EVENT_TYPES.PROJECT_COMPLETED
      : EVENT_TYPES.PROJECT_UPDATED,
    relatedEntityType: 'PROJECT',
    relatedEntityId: projectId,
    visibility: 'CLIENT_VISIBLE',
    metadata: { fields: Object.keys(updates), supportSessionId: actor.supportSessionId },
  });

  const progress = await computeProgress(actor.agencyId, [updated._id as Types.ObjectId]);
  return toProjectDto(updated as unknown as Record<string, unknown>, progress.get(String(updated._id)));
}

/**
 * Deletes a project and everything scoped to it inside this tenant.
 * Every delete re-states `agencyId`, so no other tenant can be affected.
 */
export async function deleteProject(actor: ActorContext, projectId: string): Promise<void> {
  const project = await Project.findOne({ _id: projectId, agencyId: actor.agencyId }).lean().exec();
  if (!project) throw AppError.notFound('Project not found');

  await Promise.all([
    Task.deleteMany({ agencyId: actor.agencyId, projectId }).exec(),
    Milestone.deleteMany({ agencyId: actor.agencyId, projectId }).exec(),
    Meeting.deleteMany({ agencyId: actor.agencyId, projectId }).exec(),
    Feedback.deleteMany({ agencyId: actor.agencyId, projectId }).exec(),
  ]);

  await Project.deleteOne({ _id: projectId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.PROJECT_DELETED,
    relatedEntityType: 'PROJECT',
    relatedEntityId: projectId,
    visibility: 'INTERNAL',
    metadata: { name: project.name },
  });
}

/** Project counts grouped by status, used by the agency dashboard charts. */
export async function projectStatusBreakdown(agencyId: string): Promise<Record<string, number>> {
  const rows = await Project.aggregate<{ _id: string; count: number }>([
    { $match: { agencyId: new Types.ObjectId(agencyId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).exec();

  const breakdown: Record<string, number> = {
    [PROJECT_STATUS.ACTIVE]: 0,
    [PROJECT_STATUS.ON_HOLD]: 0,
    [PROJECT_STATUS.COMPLETED]: 0,
  };
  for (const row of rows) breakdown[row._id] = row.count;
  return breakdown;
}