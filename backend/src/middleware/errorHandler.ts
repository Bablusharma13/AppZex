import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { env } from '../config/env';

interface ErrorBody {
  success: false;
  message: string;
  code: string;
  errors?: { field: string; message: string }[];
  requestId?: string;
}

/** Translates driver/driver-adapter errors into safe, meaningful HTTP errors. */
function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return AppError.unprocessable(
      'Validation failed',
      error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return AppError.unprocessable(
      'Validation failed',
      Object.values(error.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  }

  if (error instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for field "${error.path}"`);
  }

  // Duplicate key: surface the field but never the raw index/key values.
  if (typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000) {
    const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
    const fields = keyPattern ? Object.keys(keyPattern).join(', ') : 'field';
    return AppError.conflict(`A record with this ${fields} already exists`);
  }

  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return AppError.badRequest('File is too large');
    if (error.code === 'LIMIT_FILE_COUNT') return AppError.badRequest('Too many files uploaded');
    return AppError.badRequest(`Upload rejected: ${error.message}`);
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return AppError.badRequest('Malformed JSON in request body');
  }

  return AppError.internal();
}

/**
 * Centralised error middleware. Must be registered last.
 *
 * In production the response body never contains a stack trace or a raw driver
 * message; the detail is written to the log instead.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const appError = normalizeError(error);

  const logContext = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status: appError.statusCode,
    code: appError.code,
    userId: req.user?.id,
    tenantId: req.tenant?.agencyId,
  };

  if (appError.statusCode >= 500) {
    logger.error('request.failed', {
      ...logContext,
      message: (error as Error)?.message,
      stack: (error as Error)?.stack,
    });
  } else {
    logger.warn('request.rejected', logContext);
  }

  const body: ErrorBody = {
    success: false,
    message: appError.message,
    code: appError.code,
    requestId: req.requestId,
  };

  if (Array.isArray(appError.details)) {
    body.errors = appError.details as { field: string; message: string }[];
  }

  // Unexpected errors become a generic 500 in production.
  if (!env.isProduction && appError.statusCode >= 500 && error instanceof Error) {
    body.message = appError.message;
  }

  res.status(appError.statusCode).json(body);
}

/** Unmatched routes. Registered after all routers. */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBody = {
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
    requestId: req.requestId,
  };
  res.status(404).json(body);
}