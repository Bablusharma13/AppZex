import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async handler so rejected promises reach the Express error
 * pipeline instead of becoming unhandled rejections.
 */
export const asyncHandler =
  <T>(handler: (req: Request, res: Response, next: NextFunction) => Promise<T>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };