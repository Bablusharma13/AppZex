import { Types } from 'mongoose';
import { Milestone } from '../models/Milestone';
import { Task } from '../models/Task';
import { Project } from '../models/Project';
import { AppError } from '../utils/AppError';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity } from './activity.service';
import { EVENT_TYPES, MILESTONE_STATUS } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface MilestoneDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  name: string;
  description?: string;
  status: string;
  dueDate?: Date;
  order: number;
  completedAt?: Date;
  taskCount?: number;
  completedTaskCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

function toMilestoneDto(doc: Record<string, unknown>): MilestoneDto {
  const project = doc.project as { _id: Types.ObjectId; name: string } | undefined;
  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    projectId: String(doc.projectId),
    project: project ? { id: String(project._id), name: project.name } : undefined,
    name: doc.name as string,
    description: doc.description as string | undefined,
    status: doc.status as string,
    dueDate: doc.dueDate as Date | undefined,
    order: doc.order as number,
    completedAt: doc.completedAt as Date | undefined,
    taskCount: doc.taskCount as number | undefined,
    completedTaskCount: doc.completedTaskCount as number | undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

/** Confirms the project exists inside the tenant. */
async function requireProject(agencyId: string, projectId: string): Promise<void> {
  const exists = await Project.findOne({ _id: projectId, agencyId }).select('_id').lean().exec();
  if (!exists) throw AppError.badRequest('The selected project does not exist in your agency');
}

export interface ListMilestonesParams {
  page: number;
  limit: number;
  search?: string;
  projectId?: string;
  status?: string;
  sortBy: 'order' | 'dueDate' | 'createdAt';
  sortOrder: 'asc' | 'desc';
}

export async function listMilestones(
  actor: ActorContext,
  params: ListMilestonesParams,
): Promise<Paginated<MilestoneDto>> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };
  if (params.projectId) filter.projectId = params.projectId;
  if (params.status) filter.status = params.status;
  if (params.search) filter.name = new RegExp(escapeRegex(params.search), 'i');

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Milestone.find(filter)
      .populate('project', 'name')
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Milestone.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toMilestoneDto(d as unknown as Record<string, unknown>));
  await attachTaskCounts(actor.agencyId, items);

  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<MilestoneDto>;
}

/** Adds per-milestone task counts without N+1 lookups. */
async function attachTaskCounts(agencyId: string, items: MilestoneDto[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => new Types.ObjectId(i.id));

  const rows = await Milestone.collection
    .aggregate<{ _id: Types.ObjectId; total: number; completed: number }>([
      { $match: { agencyId: new Types.ObjectId(agencyId), _id: { $in: ids } } },
      {
        $lookup: {
          from: 'tasks',
          let: { milestoneId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$milestoneId', '$$milestoneId'] }, { $eq: ['$status', 'DONE'] }],
                },
              },
            },
            { $count: 'completed' },
          ],
          as: 'completedTasks',
        },
      },
      {
        $lookup: {
          from: 'tasks',
          let: { milestoneId: '$_id' },
          pipeline: [{ $match: { $expr: { $eq: ['$milestoneId', '$$milestoneId'] } } }, { $count: 'total' }],
          as: 'allTasks',
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ['$allTasks.total', 0] }, 0] },
          completed: { $ifNull: [{ $arrayElemAt: ['$completedTasks.completed', 0] }, 0] },
        },
      },
    ])
    .toArray();

  const map = new Map(rows.map((r) => [String(r._id), r]));
  for (const item of items) {
    const row = map.get(item.id);
    item.taskCount = row?.total ?? 0;
    item.completedTaskCount = row?.completed ?? 0;
  }
}

export interface CreateMilestoneInput {
  projectId: string;
  name: string;
  description?: string;
  status: string;
  dueDate?: Date;
  order?: number;
}

export async function createMilestone(actor: ActorContext, input: CreateMilestoneInput): Promise<MilestoneDto> {
  await requireProject(actor.agencyId, input.projectId);

  // Append to the end of the sequence when no explicit order is supplied.
  let order = input.order;
  if (order === undefined) {
    const last = await Milestone.findOne({ agencyId: actor.agencyId, projectId: input.projectId })
      .sort({ order: -1 })
      .select('order')
      .lean()
      .exec();
    order = last ? last.order + 1 : 0;
  }

  const created = await Milestone.create({
    ...input,
    order,
    agencyId: actor.agencyId,
    completedAt: input.status === MILESTONE_STATUS.COMPLETED ? new Date() : undefined,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.MILESTONE_CREATED,
    relatedEntityType: 'MILESTONE',
    relatedEntityId: created._id,
    visibility: 'CLIENT_VISIBLE',
    metadata: { name: created.name, projectId: input.projectId },
  });

  return toMilestoneDto(created.toObject() as unknown as Record<string, unknown>);
}

export async function getMilestoneById(actor: ActorContext, milestoneId: string): Promise<MilestoneDto> {
  const doc = await Milestone.findOne({ _id: milestoneId, agencyId: actor.agencyId })
    .populate('project', 'name')
    .lean()
    .exec();
  if (!doc) throw AppError.notFound('Milestone not found');

  const dto = toMilestoneDto(doc as unknown as Record<string, unknown>);
  await attachTaskCounts(actor.agencyId, [dto]);
  return dto;
}

export async function updateMilestone(
  actor: ActorContext,
  milestoneId: string,
  updates: Partial<CreateMilestoneInput>,
): Promise<MilestoneDto> {
  const set: Record<string, unknown> = { ...updates };

  if (updates.status) {
    set.completedAt = updates.status === MILESTONE_STATUS.COMPLETED ? new Date() : null;
  }

  const updated = await Milestone.findOneAndUpdate(
    { _id: milestoneId, agencyId: actor.agencyId },
    { $set: set },
    { new: true, runValidators: true },
  )
    .populate('project', 'name')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Milestone not found');

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: updates.status === MILESTONE_STATUS.COMPLETED
      ? EVENT_TYPES.MILESTONE_COMPLETED
      : EVENT_TYPES.MILESTONE_UPDATED,
    relatedEntityType: 'MILESTONE',
    relatedEntityId: milestoneId,
    visibility: 'CLIENT_VISIBLE',
    metadata: { fields: Object.keys(updates) },
  });

  return toMilestoneDto(updated as unknown as Record<string, unknown>);
}

export async function deleteMilestone(actor: ActorContext, milestoneId: string): Promise<void> {
  const milestone = await Milestone.findOne({ _id: milestoneId, agencyId: actor.agencyId }).lean().exec();
  if (!milestone) throw AppError.notFound('Milestone not found');

  // Detach tasks rather than deleting them, so task history is not lost.
  await Task.updateMany(
    { agencyId: actor.agencyId, milestoneId },
    { $set: { milestoneId: null } },
  ).exec();

  await Milestone.deleteOne({ _id: milestoneId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.MILESTONE_DELETED,
    relatedEntityType: 'MILESTONE',
    relatedEntityId: milestoneId,
    visibility: 'INTERNAL',
    metadata: { name: milestone.name },
  });
}