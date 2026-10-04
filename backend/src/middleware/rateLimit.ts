import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env';

const jsonLimitHandler = (req: Request, res: Response) => {
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please slow down and try again shortly.',
    code: 'TOO_MANY_REQUESTS',
    requestId: req.requestId,
  });
};

/** Strict limiter for credential endpoints (login / register). */
export const authRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Failed logins are the thing worth limiting; successful ones shouldn't
  // lock out a legitimate user on a shared office IP.
  skipSuccessfulRequests: true,
  handler: jsonLimitHandler,
});

/** Broad limiter applied to the whole API surface. */
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 100_000 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

/** Limits writes to keep automation from hammering the AI provider. */
export const aiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 10_000 : 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler,
});