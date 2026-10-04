import { Meeting } from '../models/Meeting';
import { Project } from '../models/Project';
import { Milestone } from '../models/Milestone';
import { Client } from '../models/Client';
import { Task } from '../models/Task';
import { AppError } from '../utils/AppError';
import { generateMeetingSummary, isAiConfigured, type AiSummaryResult } from '../ai/ai.provider';
import { validateRelations } from './task.service';
import { logActivity } from './activity.service';
import { EVENT_TYPES, TASK_STATUS } from '../types/enums';
import type { ActorContext } from './client.service';

export { isAiConfigured };

/**
 * AI Meeting Summary workflow.
 *
 * Security properties, in order of importance:
 *  1. The meeting is loaded with `agencyId` scoped to the caller's tenant, so a
 *     cross-tenant meeting id fails before any data is read.
 *  2. Supporting context (project, client, milestones, open tasks) is loaded
 *     with the same `agencyId` filter - another tenant's data can never enter
 *     the prompt.
 *  3. The provider key is read from the environment only, never logged, and
 *     provider error bodies are never echoed back to the client.
 */
export async function summarizeMeeting(
  actor: ActorContext,
  meetingId: string,
): Promise<AiSummaryResult & { meetingId: string }> {
  const meeting = await Meeting.findOne({ _id: meetingId, agencyId: actor.agencyId }).lean().exec();
  if (!meeting) throw AppError.notFound('Meeting not found');

  const notes = (meeting.notes ?? '').trim();
  if (notes.length < 20) {
    throw AppError.badRequest('Add meeting notes (at least 20 characters) before generating a summary');
  }

  const project = await Project.findOne({ _id: meeting.projectId, agencyId: actor.agencyId }).lean().exec();
  if (!project) throw AppError.notFound('Project not found');

  // Loaded separately rather than via populate: the client company name is the
  // only field needed, and a dedicated tenant-scoped query keeps it unambiguous.
  const clientCompany = await Client.findOne({ _id: project.clientId, agencyId: actor.agencyId })
    .select('companyName')
    .lean()
    .exec();

  const [milestones, openTasks] = await Promise.all([
    Milestone.find({ agencyId: actor.agencyId, projectId: meeting.projectId })
      .select('name status')
      .sort({ order: 1 })
      .limit(20)
      .lean()
      .exec(),
    Task.find({
      agencyId: actor.agencyId,
      projectId: meeting.projectId,
      status: { $ne: TASK_STATUS.DONE },
    })
      .select('title')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
      .exec(),
  ]);

  const result = await generateMeetingSummary({
    meetingTitle: meeting.title,
    meetingDate: meeting.date,
    notes,
    projectName: project.name,
    clientName: clientCompany?.companyName ?? 'Unknown client',
    milestones: milestones.map((m) => `${m.name} (${m.status})`),
    openActionItems: openTasks.map((t) => t.title),
  });

  // Persisted so the user can review and edit before it is published.
  await Meeting.updateOne(
    { _id: meetingId, agencyId: actor.agencyId },
    {
      $set: {
        aiSummary: {
          summary: result.summary,
          decisions: result.decisions,
          actionItems: result.actionItems,
          deadlines: result.deadlines,
          generatedAt: new Date(),
          model: result.model,
        },
      },
    },
  ).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.MEETING_SUMMARIZED,
    relatedEntityType: 'MEETING',
    relatedEntityId: meetingId,
    visibility: 'INTERNAL',
    metadata: { model: result.model, actionItemCount: result.actionItems.length },
  });

  return { ...result, meetingId };
}

/** Saves a human-edited version of the generated summary. */
export async function saveEditedSummary(
  actor: ActorContext,
  meetingId: string,
  input: {
    summary: string;
    decisions: string[];
    actionItems: { title: string; owner?: string; dueDate?: string }[];
    deadlines: string[];
  },
): Promise<unknown> {
  const meeting = await Meeting.findOne({ _id: meetingId, agencyId: actor.agencyId }).lean().exec();
  if (!meeting) throw AppError.notFound('Meeting not found');

  await Meeting.updateOne(
    { _id: meetingId, agencyId: actor.agencyId },
    {
      $set: {
        aiSummary: {
          summary: input.summary,
          decisions: input.decisions,
          actionItems: input.actionItems,
          deadlines: input.deadlines,
          generatedAt: new Date(),
          model: meeting.aiSummary?.model ?? 'manual-edit',
        },
      },
    },
  ).exec();

  const updated = await Meeting.findById(meetingId).lean().exec();
  return updated?.aiSummary;
}

/**
 * Converts selected AI action items into real tasks on the meeting's project.
 *
 * The project id comes from the meeting document (never the request body) and
 * every assignee/milestone reference is re-validated against the tenant.
 */
export async function convertActionItemsToTasks(
  actor: ActorContext,
  meetingId: string,
  actionItems: {
    title: string;
    assigneeId?: string | null;
    dueDate?: Date | null;
    milestoneId?: string | null;
  }[],
): Promise<{ created: number; tasks: { id: string; title: string }[] }> {
  const meeting = await Meeting.findOne({ _id: meetingId, agencyId: actor.agencyId }).lean().exec();
  if (!meeting) throw AppError.notFound('Meeting not found');

  const created: { id: string; title: string }[] = [];

  for (const item of actionItems) {
    const rel = await validateRelations(actor.agencyId, {
      projectId: String(meeting.projectId),
      milestoneId: item.milestoneId ?? null,
      assigneeId: item.assigneeId ?? null,
    });

    const task = await Task.create({
      agencyId: actor.agencyId, // server-derived
      projectId: rel.projectId,
      milestoneId: rel.milestoneId,
      assigneeId: rel.assigneeId,
      title: item.title,
      description: 'Created from an AI meeting summary action item.',
      createdBy: actor.userId,
      status: TASK_STATUS.TODO,
      priority: 'MEDIUM',
      dueDate: item.dueDate ?? null,
    });

    created.push({ id: String(task._id), title: task.title });
  }

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.TASK_CREATED,
    relatedEntityType: 'MEETING',
    relatedEntityId: meetingId,
    visibility: 'CLIENT_VISIBLE',
    metadata: { source: 'ai-action-items', count: created.length },
  });

  return { created: created.length, tasks: created };
}