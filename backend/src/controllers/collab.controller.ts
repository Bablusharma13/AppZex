import type { Request, Response } from 'express';
import * as taskService from '../services/task.service';
import * as meetingService from '../services/meeting.service';
import * as feedbackService from '../services/feedback.service';
import * as milestoneService from '../services/milestone.service';
import * as aiWorkflow from '../services/aiWorkflow.service';
import { Project } from '../models/Project';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response';
import { actorFrom, clientActorFrom } from '../utils/actorContext';
import { AiUnavailableError } from '../ai/ai.provider';
import type { CreateTaskInput, ListTasksParams } from '../services/task.service';
import type { CreateMeetingInput, ListMeetingsParams } from '../services/meeting.service';
import type { ListMilestonesParams } from '../services/milestone.service';
import type { ListFeedbackParams } from '../services/feedback.service';

// ------------------------------------------------------------------ tasks ---

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const result = await taskService.listTasks(actorFrom(req), req.query as unknown as ListTasksParams);
  return sendPaginated(res, result);
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const result = await taskService.getTaskById(actorFrom(req), req.params.id as string);
  return sendSuccess(res, result);
});

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const result = await taskService.createTask(actorFrom(req), req.body as CreateTaskInput);
  return sendCreated(res, result);
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const result = await taskService.updateTask(
    actorFrom(req),
    req.params.id as string,
    req.body as Partial<CreateTaskInput>,
  );
  return sendSuccess(res, result);
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  await taskService.deleteTask(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'Task deleted' });
});

export const addTaskComment = asyncHandler(async (req: Request, res: Response) => {
  const result = await taskService.addTaskComment(
    actorFrom(req),
    req.params.id as string,
    (req.body as { body: string }).body,
  );
  return sendCreated(res, result);
});

// --------------------------------------------------------------- meetings ---

export const listMeetings = asyncHandler(async (req: Request, res: Response) => {
  const result = await meetingService.listMeetings(
    actorFrom(req),
    req.query as unknown as ListMeetingsParams,
    { includeInternalNotes: true },
  );
  return sendPaginated(res, result);
});

export const getMeeting = asyncHandler(async (req: Request, res: Response) => {
  const result = await meetingService.getMeetingById(actorFrom(req), req.params.id as string, {
    includeInternalNotes: true,
  });
  return sendSuccess(res, result);
});

export const createMeeting = asyncHandler(async (req: Request, res: Response) => {
  const result = await meetingService.createMeeting(actorFrom(req), req.body as CreateMeetingInput);
  return sendCreated(res, result);
});

export const updateMeeting = asyncHandler(async (req: Request, res: Response) => {
  const result = await meetingService.updateMeeting(
    actorFrom(req),
    req.params.id as string,
    req.body as Partial<CreateMeetingInput>,
  );
  return sendSuccess(res, result);
});

export const deleteMeeting = asyncHandler(async (req: Request, res: Response) => {
  await meetingService.deleteMeeting(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'Meeting deleted' });
});

/** Client-visible meetings only; scoped to the caller's own projects. */
export const listClientMeetings = asyncHandler(async (req: Request, res: Response) => {
  const result = await meetingService.listMeetings(
    clientActorFrom(req),
    req.query as unknown as ListMeetingsParams,
    { clientMode: true },
  );
  return sendPaginated(res, result);
});

/**
 * Client-facing milestones.
 *
 * Resolves the client's own projects first and returns only milestones attached
 * to them, so a client can never enumerate another company's work. Any
 * `projectId` supplied by the caller is deliberately ignored.
 */
export const listClientMilestones = asyncHandler(async (req: Request, res: Response) => {
  const actor = clientActorFrom(req);
  if (!actor.clientId) throw AppError.forbidden('This endpoint requires a client account');

  const projectIds = (
    await Project.find({ agencyId: actor.agencyId, clientId: actor.clientId })
      .select('_id')
      .lean()
      .exec()
  ).map((p) => String(p._id));

  if (projectIds.length === 0) {
    return sendPaginated(res, {
      items: [], page: 1, limit: 20, total: 0, totalPages: 0,
      hasNextPage: false, hasPrevPage: false,
    });
  }

  const result = await milestoneService.listMilestones(actor, {
    // Zod has already applied defaults, so the parsed query is complete.
    ...(req.query as unknown as ListMilestonesParams),
    page: 1,
    limit: 200,
  });

  // Defence in depth: keep only milestones on the client's own projects, even
  // though the service filter is already tenant-scoped.
  const items = result.items.filter((m) => projectIds.includes(m.projectId));

  return sendPaginated(res, {
    ...result,
    items,
    total: items.length,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
});

// --------------------------------------------------------------- feedback ---

export const listFeedback = asyncHandler(async (req: Request, res: Response) => {
  const result = await feedbackService.listFeedback(
    clientActorFrom(req),
    req.query as unknown as ListFeedbackParams,
  );
  return sendPaginated(res, result);
});

export const getFeedback = asyncHandler(async (req: Request, res: Response) => {
  const result = await feedbackService.getFeedbackById(clientActorFrom(req), req.params.id as string);
  return sendSuccess(res, result);
});

export const createFeedback = asyncHandler(async (req: Request, res: Response) => {
  const result = await feedbackService.createFeedback(clientActorFrom(req), req.body);
  return sendCreated(res, result);
});

export const updateFeedbackStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await feedbackService.updateFeedbackStatus(
    actorFrom(req),
    req.params.id as string,
    req.body as { status: string; agencyResponse?: string },
  );
  return sendSuccess(res, result);
});

export const replyFeedback = asyncHandler(async (req: Request, res: Response) => {
  const result = await feedbackService.replyToFeedback(
    clientActorFrom(req),
    req.params.id as string,
    (req.body as { body: string }).body,
  );
  return sendSuccess(res, result);
});

export const deleteFeedback = asyncHandler(async (req: Request, res: Response) => {
  await feedbackService.deleteFeedback(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'Feedback deleted' });
});

// --------------------------------------------------------------------- AI ---

/**
 * Generates an AI summary for a meeting.
 *
 * An unavailable provider becomes a 503 with a readable message; every other
 * part of the API keeps working unchanged.
 */
export const generateSummary = asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await aiWorkflow.summarizeMeeting(actorFrom(req), req.params.id as string);
    return sendSuccess(res, result);
  } catch (error) {
    if (error instanceof AiUnavailableError) throw AppError.serviceUnavailable(error.message);
    throw error;
  }
});

export const saveSummary = asyncHandler(async (req: Request, res: Response) => {
  const result = await aiWorkflow.saveEditedSummary(actorFrom(req), req.params.id as string, req.body);
  return sendSuccess(res, result);
});

export const convertActions = asyncHandler(async (req: Request, res: Response) => {
  const { actionItems } = req.body as {
    actionItems: Parameters<typeof aiWorkflow.convertActionItemsToTasks>[2];
  };
  const result = await aiWorkflow.convertActionItemsToTasks(
    actorFrom(req),
    req.params.id as string,
    actionItems,
  );
  return sendCreated(res, result);
});