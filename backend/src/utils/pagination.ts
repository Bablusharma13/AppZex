import { z } from 'zod';
import type { Paginated } from '../types';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const searchQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  ...paginationQuerySchema.shape,
});

export function buildPagination(page: number, limit: number, total: number): Paginated<never> {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    items: [],
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  } as Paginated<never>;
}

/** Escapes user input before it is embedded into a RegExp. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}