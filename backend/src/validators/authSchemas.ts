import { z } from 'zod';
import {
  AGENCY_STATUS, PLANS, ROLES,
} from '../types/enums';
import { booleanQuery, email, isoDate, objectId, password, paginationQuerySchema, shortText, sortOrder, optionalText } from './common';

// ---------------------------------------------------------------- auth -----

export const registerSchema = z.object({
  agencyName: shortText(160),
  name: shortText(120),
  email,
  password,
  phone: z.string().trim().max(32).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    name: shortText(120).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(32).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');

// --------------------------------------------------------------- admin -----

export const agencyListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(Object.values(AGENCY_STATUS) as [string, ...string[]]).optional(),
  plan: z.enum(Object.values(PLANS) as [string, ...string[]]).optional(),
  sortBy: z.enum(['createdAt', 'name', 'status']).default('createdAt'),
  sortOrder,
});

export const updateAgencySchema = z
  .object({
    name: shortText(160).optional(),
    ownerName: shortText(120).optional(),
    email: email.optional(),
    phone: z.string().trim().max(32).optional(),
    plan: z.enum(Object.values(PLANS) as [string, ...string[]]).optional(),
    address: z.string().trim().max(400).optional(),
    website: z.string().trim().max(200).optional(),
    status: z.enum(Object.values(AGENCY_STATUS) as [string, ...string[]]).optional(),
    suspensionReason: z.string().trim().max(400).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');

/**
 * Starting a support session.
 *
 * `agencyId` must be declared here: Zod strips unknown keys, so an undeclared
 * field would be removed and the session would resolve to no agency at all.
 */
export const supportSessionSchema = z.object({
  agencyId: objectId,
  reason: shortText(400),
  scope: z.enum(['READ_ONLY', 'READ_WRITE']).default('READ_ONLY'),
  durationMinutes: z.coerce.number().int().min(1).max(480).default(60),
});

export const platformActivityQuerySchema = paginationQuerySchema.extend({
  eventType: z.string().trim().max(60).optional(),
  agencyId: objectId.optional(),
  actorType: z.enum(['USER', 'SYSTEM']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ---------------------------------------------------------------- team -----

export const createTeamMemberSchema = z.object({
  name: shortText(120),
  email,
  password,
  role: z.enum([ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM]),
  jobTitle: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
});

export const updateTeamMemberSchema = z
  .object({
    name: shortText(120).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(32).optional(),
    role: z.enum([ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');

export const teamListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  role: z.enum([ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM]).optional(),
  isActive: booleanQuery.optional(),
});

// -------------------------------------------------------------- clients ----

export const clientListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  isActive: booleanQuery.optional(),
  sortBy: z.enum(['createdAt', 'companyName']).default('createdAt'),
  sortOrder,
});

export const createClientSchema = z.object({
  companyName: shortText(180),
  contactPerson: shortText(120),
  email,
  phone: z.string().trim().max(32).optional(),
  notes: optionalText(2000),
  address: z.string().trim().max(400).optional(),
});

export const updateClientSchema = createClientSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields supplied');

export const createClientUserSchema = z.object({
  name: shortText(120),
  email,
  password,
  jobTitle: z.string().trim().max(120).optional(),
});

export { optionalText };