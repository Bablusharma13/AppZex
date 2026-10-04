import { Types } from 'mongoose';
import { Meeting } from '../models/Meeting';
import { Project } from '../models/Project';
import { AppError } from '../utils/AppError';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity, notify } from './activity.service';
import { generateMeetingSummary, isAiConfigured, type AiSummaryResult } from '../ai/ai.provider';
import { EVENT_TYPES, VISIBILITY } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface MeetingDto {
  id: string;
  agencyId: string;
  projectId: string;
  project?: { id: string; name: string };
  title: string;
  date: Date;
  durationMinutes?: number;
  notes?: string;
  agenda?: string;
  internalNotes?: string;
  visibility: string;
  attendees: string[];
  aiSummary: (AiSummaryResult & { generatedAt: Date }) | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingOptions {
  /** Client accounts may only ever see CLIENT_VISIBLE meetings. */
  clientMode?: boolean;
  /** Staff may request internal notes explicitly. */
  includeInternalNotes?: boolean;
}

/**
 * `internalNotes` is declared `select: false` on the schema, so it is already
 * absent from a lean document unless the caller explicitly asked for it.
 */
function toMeetingDto(doc: Record<string, unknown>): MeetingDto {
  const project = doc.project as { _id: Types.ObjectId; name: string } | undefined;
  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    projectId: String(doc.projectId),
    project: project ? { id: String(project._id), name: project.name } : undefined,
    title: doc.title as string,
    date: doc.date as Date,
    durationMinutes: doc.durationMinutes as number | undefined,
    notes: doc.notes as string | undefined,
    agenda: doc.agenda as string | undefined,
    internalNotes: doc.internalNotes as string | undefined,
    visibility: doc.visibility as string,
    attendees: (doc.attendees as string[]) ?? [],
    aiSummary: (doc.aiSummary as MeetingDto['aiSummary']) ?? null,
    createdBy: String(doc.createdBy),
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

export interface ListMeetingsParams {
  page: number;
  limit: number;
  search?: string;
  projectId?: string;
  visibility?: string;
  from?: Date;
  to?: Date;
  sortBy: 'date' | 'createdAt' | 'title';
  sortOrder: 'asc' | 'desc';
}

export async function listMeetings(
  actor: ActorContext,
  params: ListMeetingsParams,
  options: MeetingOptions = {},
): Promise<Paginated<MeetingDto>> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };

  // A client account is hard-limited to CLIENT_VISIBLE whatever it requests.
  if (options.clientMode) filter.visibility = VISIBILITY.CLIENT_VISIBLE;
  else if (params.visibility) filter.visibility = params.visibility;

  if (params.projectId) filter.projectId = params.projectId;
  if (params.search) filter.title = new RegExp(escapeRegex(params.search), 'i');
  if (params.from || params.to) {
    filter.date = {
      ...(params.from ? { $gte: params.from } : {}),
      ...(params.to ? { $lte: params.to } : {}),
    };
  }

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Meeting.find(filter)
      .populate('project', 'name')
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Meeting.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toMeetingDto(d as unknown as Record<string, unknown>));
  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<MeetingDto>;
}

export interface CreateMeetingInput {
  projectId: string;
  title: string;
  date: Date;
  durationMinutes?: number;
  agenda?: string;
  notes?: string;
  internalNotes?: string;
  visibility: string;
  attendees: string[];
}

export async function createMeeting(actor: ActorContext, input: CreateMeetingInput): Promise<MeetingDto> {
  const project = await Project.findOne({ _id: input.projectId, agencyId: actor.agencyId }).lean().exec();
  if (!project) throw AppError.badRequest('The selected project does not exist in your agency');

  const created = await Meeting.create({
    ...input,
    agencyId: actor.agencyId,
    createdBy: actor.userId,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.MEETING_CREATED,
    relatedEntityType: 'MEETING',
    relatedEntityId: created._id,
    visibility: created.visibility,
    metadata: { title: created.title, projectId: input.projectId },
  });

  if (created.visibility === VISIBILITY.CLIENT_VISIBLE) {
    await notify({
      agencyId: actor.agencyId,
      type: 'MEETING_POSTED',
      title: 'New meeting notes available',
      body: created.title,
      link: `/client/projects/${input.projectId}`,
    });
  }

  return toMeetingDto(created.toObject() as unknown as Record<string, unknown>);
}

export async function getMeetingById(
  actor: ActorContext,
  meetingId: string,
  options: MeetingOptions = {},
): Promise<MeetingDto> {
  const filter: Record<string, unknown> = { _id: meetingId, agencyId: actor.agencyId };
  if (options.clientMode) filter.visibility = VISIBILITY.CLIENT_VISIBLE;

  const query = Meeting.findOne(filter).populate('project', 'name');
  if (!options.includeInternalNotes || options.clientMode) query.select('-internalNotes');

  const doc = await query.lean().exec();
  if (!doc) throw AppError.notFound('Meeting not found');
  return toMeetingDto(doc as unknown as Record<string, unknown>);
}

export async function updateMeeting(
  actor: ActorContext,
  meetingId: string,
  updates: Partial<CreateMeetingInput>,
): Promise<MeetingDto> {
  const updated = await Meeting.findOneAndUpdate(
    { _id: meetingId, agencyId: actor.agencyId },
    { $set: updates },
    { new: true, runValidators: true },
  )
    .populate('project', 'name')
    .lean()
    .exec();

  if (!updated) throw AppError.notFound('Meeting not found');

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.MEETING_UPDATED,
    relatedEntityType: 'MEETING',
    relatedEntityId: meetingId,
    visibility: updated.visibility,
    metadata: { fields: Object.keys(updates) },
  });

  return toMeetingDto(updated as unknown as Record<string, unknown>);
}

export async function deleteMeeting(actor: ActorContext, meetingId: string): Promise<void> {
  const meeting = await Meeting.findOne({ _id: meetingId, agencyId: actor.agencyId }).lean().exec();
  if (!meeting) throw AppError.notFound('Meeting not found');

  await Meeting.deleteOne({ _id: meetingId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.MEETING_DELETED,
    relatedEntityType: 'MEETING',
    relatedEntityId: meetingId,
    visibility: 'INTERNAL',
    metadata: { title: meeting.title },
  });
}

export { generateMeetingSummary, isAiConfigured };
export type { AiSummaryResult };