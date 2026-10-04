import { z } from 'zod';
import { PRIORITIES, TASK_STATUS, VISIBILITY } from '../types/enums';
import { booleanQuery, isoDate, objectId, optionalText, paginationQuerySchema, shortText, sortOrder } from './common';

// ---------------------------------------------------------------- tasks ----

export const taskListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  projectId: objectId.optional(),
  milestoneId: objectId.optional(),
  assigneeId: objectId.optional(),
  status: z.enum(Object.values(TASK_STATUS) as [string, ...string[]]).optional(),
  priority: z.enum(Object.values(PRIORITIES) as [string, ...string[]]).optional(),
  overdue: booleanQuery.optional(),
  dueWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  sortBy: z.enum(['createdAt', 'dueDate', 'title', 'status', 'priority']).default('createdAt'),
  sortOrder,
});

export const createTaskSchema = z.object({
  projectId: objectId,
  milestoneId: objectId.optional().nullable(),
  title: shortText(200),
  description: optionalText(4000),
  assigneeId: objectId.optional().nullable(),
  priority: z.enum(Object.values(PRIORITIES) as [string, ...string[]]).default('MEDIUM'),
  status: z.enum(Object.values(TASK_STATUS) as [string, ...string[]]).default('TODO'),
  dueDate: isoDate.optional().nullable(),
});

export const updateTaskSchema = z
  .object({
    milestoneId: objectId.optional().nullable(),
    title: shortText(200).optional(),
    description: optionalText(4000),
    assigneeId: objectId.optional().nullable(),
    priority: z.enum(Object.values(PRIORITIES) as [string, ...string[]]).optional(),
    status: z.enum(Object.values(TASK_STATUS) as [string, ...string[]]).optional(),
    dueDate: isoDate.optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');

export const addTaskCommentSchema = z.object({ body: shortText(2000) });

// ------------------------------------------------------------- meetings ----
// (Declared here for structural locality; re-exported by collabSchemas so the
// meeting routes have a single obvious import surface.)

export const meetingListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  projectId: objectId.optional(),
  visibility: z.enum(Object.values(VISIBILITY) as [string, ...string[]]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sortBy: z.enum(['date', 'createdAt', 'title']).default('date'),
  sortOrder,
});

export const createMeetingSchema = z.object({
  projectId: objectId,
  title: shortText(200),
  date: isoDate,
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  agenda: optionalText(4000),
  notes: optionalText(20000),
  internalNotes: optionalText(10000),
  visibility: z.enum(Object.values(VISIBILITY) as [string, ...string[]]).default('INTERNAL'),
  attendees: z.array(z.string().trim().max(120)).max(50).default([]),
});

export const updateMeetingSchema = z
  .object({
    title: shortText(200).optional(),
    date: isoDate.optional(),
    durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
    agenda: optionalText(4000),
    notes: optionalText(20000),
    internalNotes: optionalText(10000),
    visibility: z.enum(Object.values(VISIBILITY) as [string, ...string[]]).optional(),
    attendees: z.array(z.string().trim().max(120)).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');