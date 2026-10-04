import { z } from 'zod';
import { FEEDBACK_STATUS, VISIBILITY } from '../types/enums';
import { isoDate, objectId, optionalText, paginationQuerySchema, shortText, sortOrder } from './common';

// -------------------------------------------------- AI summary editing ----

export const updateAiSummarySchema = z.object({
  summary: shortText(8000),
  decisions: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  actionItems: z
    .array(
      z.object({
        title: shortText(300),
        owner: z.string().trim().max(120).optional(),
        dueDate: z.string().trim().max(60).optional(),
      }),
    )
    .max(30)
    .default([]),
  deadlines: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
});

export const convertActionsSchema = z.object({
  actionItems: z
    .array(
      z.object({
        title: shortText(300),
        assigneeId: objectId.optional().nullable(),
        dueDate: isoDate.optional().nullable(),
        milestoneId: objectId.optional().nullable(),
      }),
    )
    .min(1, 'Select at least one action item')
    .max(30),
});

// ------------------------------------------------------------- feedback ----

export const feedbackListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  projectId: objectId.optional(),
  status: z.enum(Object.values(FEEDBACK_STATUS) as [string, ...string[]]).optional(),
  category: z.string().trim().max(40).optional(),
  sortBy: z.enum(['createdAt', 'status', 'title']).default('createdAt'),
  sortOrder,
});

export const createFeedbackSchema = z.object({
  projectId: objectId,
  title: shortText(200),
  description: shortText(8000),
  category: z.enum(['GENERAL', 'BUG', 'CHANGE_REQUEST', 'DESIGN', 'CONTENT']).default('GENERAL'),
});

export const updateFeedbackStatusSchema = z.object({
  status: z.enum(Object.values(FEEDBACK_STATUS) as [string, ...string[]]),
  agencyResponse: optionalText(8000),
});

export const replyFeedbackSchema = z.object({ body: shortText(4000) });

// ---------------------------------------------------------------- files ----

export const fileListQuerySchema = paginationQuerySchema.extend({
  projectId: objectId.optional(),
  relatedEntityType: z.enum(['PROJECT', 'TASK', 'FEEDBACK', 'MEETING']).optional(),
  relatedEntityId: objectId.optional(),
  // Staff-only filter. A client account is pinned to CLIENT_VISIBLE by the
  // service, so this parameter can never widen what a client may see.
  visibility: z.enum(Object.values(VISIBILITY) as [string, ...string[]]).optional(),
  search: z.string().trim().max(120).optional(),
  sortBy: z.enum(['createdAt', 'size', 'originalName']).default('createdAt'),
  sortOrder,
});

export const fileMetadataSchema = z.object({
  relatedEntityType: z.enum(['PROJECT', 'TASK', 'FEEDBACK', 'MEETING']),
  relatedEntityId: objectId,
  visibility: z.enum(Object.values(VISIBILITY) as [string, ...string[]]).default('INTERNAL'),
});

/** Upload allow-list: documents and images only, never executables. */
export const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

// ------------------------------------------------------------- activity ----

export const activityListQuerySchema = paginationQuerySchema.extend({
  eventType: z.string().trim().max(60).optional(),
  relatedEntityType: z.string().trim().max(40).optional(),
  relatedEntityId: objectId.optional(),
  actorId: objectId.optional(),
  visibility: z.enum(Object.values(VISIBILITY) as [string, ...string[]]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().trim().max(120).optional(),
});

// Meeting schemas live next to the task schemas and are re-exported here so all
// collaboration input validation is reachable from one module.
export {
  meetingListQuerySchema,
  createMeetingSchema,
  updateMeetingSchema,
} from './taskSchemas';