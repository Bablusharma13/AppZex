import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError } from '../utils/AppError';

interface ValidationTargets {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Zod validation middleware.
 *
 * Validated output replaces the raw input, so downstream code receives coerced,
 * trimmed, whitelisted values. Because Zod schemas strip unknown keys by
 * default, a client cannot smuggle `agencyId` or `role` into a payload.
 */
export function validate(targets: ValidationTargets): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (targets.params) req.params = targets.params.parse(req.params);
      if (targets.query) {
        const parsed = targets.query.parse(req.query) as Record<string, unknown>;
        // Express 5 exposes `req.query` as a getter, so redefine rather than assign.
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (targets.body) req.body = targets.body.parse(req.body ?? {});
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        }));
        return next(AppError.unprocessable('Validation failed', details));
      }
      return next(error);
    }
  };
}

/** Convenience wrapper for body-only validation. */
export const validateBody = (schema: ZodSchema): RequestHandler => validate({ body: schema });

/** Convenience wrapper for a route parameter object id. */
export const validateParams = (schema: ZodSchema): RequestHandler => validate({ params: schema });