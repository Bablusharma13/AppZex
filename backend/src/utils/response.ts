import type { Response } from 'express';
import type { Paginated } from '../types';

/** Standard success envelope: `{ success: true, data: ... }` */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): Response {
  return res.status(statusCode).json({ success: true, data });
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendSuccess(res, data, 201);
}

export function sendPaginated<T>(res: Response, page: Paginated<T>): Response {
  return res.status(200).json({ success: true, data: page.items, pagination: {
    page: page.page,
    limit: page.limit,
    total: page.total,
    totalPages: page.totalPages,
    hasNextPage: page.hasNextPage,
    hasPrevPage: page.hasPrevPage,
  } });
}