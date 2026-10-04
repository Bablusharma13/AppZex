import { Types } from 'mongoose';
import { Feedback } from '../models/Feedback';
import { Project } from '../models/Project';
import { AppError } from '../utils/AppError';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity, notify } from './activity.service';
import { EVENT_TYPES, FEEDBACK_STATUS } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface FeedbackDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  clientId: string;
  client?: { id: string; companyName: string };
  submittedBy: string;
  submittedByName: string;
  title: string;
  description: string;
  category: string;
  status: string;
  agencyResponse?: string;
  respondedAt?: Date;
  replies: { authorId: string; authorName: string; authorRole: string; body: string; createdAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

function toFeedbackDto(doc: Record<string, unknown>): FeedbackDto {
  const project = doc.project as { _id: Types.ObjectId; name: string } | undefined;
  const client = doc.client as { _id: Types.ObjectId; companyName: string } | undefined;

  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    projectId: String(doc.projectId),
    project: project ? { id: String(project._id), name: project.name } : undefined,
    clientId: String(doc.clientId),
    client: client ? { id: String(client._id), companyName: client.companyName } : undefined,
    submittedBy: String(doc.submittedBy),
    submittedByName: doc.submittedByName as string,
    title: doc.title as string,
    description: doc.description as string,
    category: doc.category as string,
    status: doc.status as string,
    agencyResponse: doc.agencyResponse as string | undefined,
    respondedAt: doc.respondedAt as Date | undefined,
    replies: ((doc.replies as Record<string, unknown>[]) ?? []).map((r) => ({
      authorId: String(r.authorId),
      authorName: r.authorName as string,
      authorRole: r.authorRole as string,
      body: r.body as string,
      createdAt: r.createdAt as Date,
    })),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

/**
 * Base filter for the caller's tenant.
 *
 * A client account additionally gets `clientId` pinned to its own company, which
 * is what prevents Client 1 from reading or changing Client 2's requests.
 */
function baseFilter(actor: ActorContext & { clientId?: string }): Record<string, unknown> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };
  if (actor.clientId) filter.clientId = actor.clientId;
  return filter;
}

export interface ListFeedbackParams {
  page: number;
  limit: number;
  search?: string;
  projectId?: string;
  status?: string;
  category?: string;
  sortBy: 'createdAt' | 'status' | 'title';
  sortOrder: 'asc' | 'desc';
}

export async function listFeedback(
  actor: ActorContext & { clientId?: string },
  params: ListFeedbackParams,
): Promise<Paginated<FeedbackDto>> {
  const filter = baseFilter(actor);

  if (params.projectId) filter.projectId = params.projectId;
  if (params.status) filter.status = params.status;
  if (params.category) filter.category = params.category;
  if (params.search) filter.title = new RegExp(escapeRegex(params.search), 'i');

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Feedback.find(filter)
      .populate('project', 'name')
      .populate('client', 'companyName')
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Feedback.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toFeedbackDto(d as unknown as Record<string, unknown>));
  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<FeedbackDto>;
}

/**
 * Creates a change request. Only a client account may submit feedback, and the
 * project must belong to its own company.
 */
export async function createFeedback(
  actor: ActorContext & { clientId?: string },
  input: { projectId: string; title: string; description: string; category: string },
): Promise<FeedbackDto> {
  if (!actor.clientId) throw AppError.forbidden('Only client accounts can submit feedback');

  const project = await Project.findOne({
    _id: input.projectId,
    agencyId: actor.agencyId,
    clientId: actor.clientId, // must be one of *our* projects
  })
    .lean()
    .exec();

  if (!project) throw AppError.notFound('Project not found');

  const created = await Feedback.create({
    ...input,
    agencyId: actor.agencyId,
    clientId: actor.clientId, // server-derived
    submittedBy: actor.userId,
    submittedByName: actor.name,
    status: FEEDBACK_STATUS.OPEN,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.FEEDBACK_SUBMITTED,
    relatedEntityType: 'FEEDBACK',
    relatedEntityId: created._id,
    visibility: 'CLIENT_VISIBLE',
    metadata: { title: created.title, projectId: input.projectId, category: created.category },
  });

  await notify({
    agencyId: actor.agencyId,
    type: 'FEEDBACK_SUBMITTED',
    title: 'New client feedback',
    body: created.title,
    link: '/workspace/feedback',
  });

  return toFeedbackDto(created.toObject() as unknown as Record<string, unknown>);
}

export async function getFeedbackById(
  actor: ActorContext & { clientId?: string },
  feedbackId: string,
): Promise<FeedbackDto> {
  const doc = await Feedback.findOne({ _id: feedbackId, ...baseFilter(actor) })
    .populate('project', 'name')
    .populate('client', 'companyName')
    .lean()
    .exec();

  if (!doc) throw AppError.notFound('Feedback not found');
  return toFeedbackDto(doc as unknown as Record<string, unknown>);
}

/** Agency staff change the status and optionally record a formal response. */
export async function updateFeedbackStatus(
  actor: ActorContext,
  feedbackId: string,
  input: { status: string; agencyResponse?: string },
): Promise<FeedbackDto> {
  const set: Record<string, unknown> = { status: input.status };
  if (input.agencyResponse) {
    set.agencyResponse = input.agencyResponse;
    set.respondedBy = actor.userId;
    set.respondedAt = new Date();
  }

  const updated = await Feedback.findOneAndUpdate(
    { _id: feedbackId, agencyId: actor.agencyId },
    { $set: set },
    { new: true, runValidators: true },
  )
    .populate('project', 'name')
    .populate('client', 'companyName')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Feedback not found');

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType:
      input.status === FEEDBACK_STATUS.RESOLVED
        ? EVENT_TYPES.FEEDBACK_RESOLVED
        : EVENT_TYPES.FEEDBACK_STATUS_CHANGED,
    relatedEntityType: 'FEEDBACK',
    relatedEntityId: feedbackId,
    visibility: 'CLIENT_VISIBLE',
    metadata: { status: input.status, responded: Boolean(input.agencyResponse) },
  });

  if (input.agencyResponse) {
    await notify({
      agencyId: actor.agencyId,
      recipientId: updated.submittedBy ? String(updated.submittedBy) : null,
      type: 'FEEDBACK_RESPONSE',
      title: 'Your feedback received a response',
      body: updated.title,
      link: '/client/feedback',
    });
  }

  return toFeedbackDto(updated as unknown as Record<string, unknown>);
}

/** Threaded reply visible to both the client and the agency. */
export async function replyToFeedback(
  actor: ActorContext & { clientId?: string },
  feedbackId: string,
  body: string,
): Promise<FeedbackDto> {
  const updated = await Feedback.findOneAndUpdate(
    { _id: feedbackId, ...baseFilter(actor) },
    {
      $push: {
        replies: {
          authorId: actor.userId,
          authorName: actor.name,
          authorRole: actor.role,
          body,
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  )
    .populate('project', 'name')
    .populate('client', 'companyName')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Feedback not found');

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.FEEDBACK_RESPONDED,
    relatedEntityType: 'FEEDBACK',
    relatedEntityId: feedbackId,
    visibility: 'CLIENT_VISIBLE',
    metadata: { role: actor.role },
  });

  return toFeedbackDto(updated as unknown as Record<string, unknown>);
}

export async function deleteFeedback(actor: ActorContext, feedbackId: string): Promise<void> {
  const feedback = await Feedback.findOne({ _id: feedbackId, agencyId: actor.agencyId }).lean().exec();
  if (!feedback) throw AppError.notFound('Feedback not found');

  await Feedback.deleteOne({ _id: feedbackId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.FEEDBACK_DELETED,
    relatedEntityType: 'FEEDBACK',
    relatedEntityId: feedbackId,
    visibility: 'INTERNAL',
    metadata: { title: feedback.title },
  });
}

/** Feedback counts grouped by status for the dashboards. */
export async function feedbackStatusBreakdown(agencyId: string): Promise<Record<string, number>> {
  const rows = await Feedback.aggregate<{ _id: string; count: number }>([
    { $match: { agencyId: new Types.ObjectId(agencyId) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).exec();

  const breakdown: Record<string, number> = {
    [FEEDBACK_STATUS.OPEN]: 0,
    [FEEDBACK_STATUS.IN_REVIEW]: 0,
    [FEEDBACK_STATUS.IN_PROGRESS]: 0,
    [FEEDBACK_STATUS.RESOLVED]: 0,
    [FEEDBACK_STATUS.DECLINED]: 0,
  };
  for (const row of rows) breakdown[row._id] = row.count;
  return breakdown;
}