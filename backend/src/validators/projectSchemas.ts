import { z } from 'zod';
import { PRIORITIES, PROJECT_STATUS } from '../types/enums';
import { isoDate, objectId, optionalText, paginationQuerySchema, shortText, sortOrder } from './common';

// ------------------------------------------------------------- projects ----

export const projectListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(Object.values(PROJECT_STATUS) as [string, ...string[]]).optional(),
  priority: z.enum(Object.values(PRIORITIES) as [string, ...string[]]).optional(),
  clientId: objectId.optional(),
  projectManagerId: objectId.optional(),
  dueWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'expectedCompletionDate', 'status']).default('updatedAt'),
  sortOrder,
});

/** Base object for the create payload; kept separate so `.partial()` is valid. */
const projectFields = z.object({
  name: shortText(180),
  description: optionalText(4000),
  clientId: objectId,
  startDate: isoDate,
  expectedCompletionDate: isoDate.optional(),
  status: z.enum(Object.values(PROJECT_STATUS) as [string, ...string[]]).default('ACTIVE'),
  priority: z.enum(Object.values(PRIORITIES) as [string, ...string[]]).default('MEDIUM'),
  projectManagerId: objectId.optional(),
  budget: z.coerce.number().min(0).max(1_000_000_000).optional(),
});

export const createProjectSchema = projectFields.refine(
  (v) => !v.expectedCompletionDate || v.expectedCompletionDate >= v.startDate,
  {
    message: 'Expected completion date must be on or after the start date',
    path: ['expectedCompletionDate'],
  },
);

export const updateProjectSchema = projectFields
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');

// ----------------------------------------------------------- milestones ----

export const milestoneListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  projectId: objectId.optional(),
  status: z
    .enum(['PENDING', 'IN_PROGRESS', 'COMPLETED'])
    .optional(),
  sortBy: z.enum(['order', 'dueDate', 'createdAt']).default('order'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export const createMilestoneSchema = z.object({
  projectId: objectId,
  name: shortText(160),
  description: optionalText(2000),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('PENDING'),
  dueDate: isoDate.optional(),
  order: z.coerce.number().int().min(0).optional(),
});

export const updateMilestoneSchema = z
  .object({
    name: shortText(160).optional(),
    description: optionalText(2000),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).optional(),
    dueDate: isoDate.optional(),
    order: z.coerce.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');