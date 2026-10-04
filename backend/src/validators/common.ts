import { z } from 'zod';
import { paginationQuerySchema } from '../utils/pagination';

/** Mongo ObjectId exposed as a string in every API payload. */
export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Must be a valid identifier');

export const objectIdParam = z.object({ id: objectId });

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('A valid email address is required')
  .max(180);

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

export const shortText = (max = 200) => z.string().trim().min(1, 'Required').max(max);

export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(''));

export const isoDate = z.coerce.date({ invalid_type_error: 'Must be a valid date' });

/** Shared list-query building blocks. */
export const sortOrder = z.enum(['asc', 'desc']).default('desc');

export const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

export { paginationQuerySchema };