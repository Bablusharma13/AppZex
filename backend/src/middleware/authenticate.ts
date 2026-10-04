import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { Agency } from '../models/Agency';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/crypto';
import { logger } from '../config/logger';
import { AGENCY_STATUS, ROLES, type Role } from '../types/enums';

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    return token.length ? token : null;
  }
  return null;
}

/**
 * Verifies the JWT, then re-reads the user from the database.
 *
 * Re-reading on every request means a deactivated user, or one whose role or
 * agency changed, loses access immediately rather than at token expiry.
 */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    logger.warn('auth.missing_token', { path: req.originalUrl, ip: req.ip });
    throw AppError.unauthorized('Authentication token is missing');
  }

  const payload = verifyAccessToken(token);

  if (!Types.ObjectId.isValid(payload.sub)) {
    throw AppError.unauthorized('Invalid authentication token');
  }

  const user = await User.findById(payload.sub).lean().exec();
  if (!user) throw AppError.unauthorized('Account no longer exists');

  if (!user.isActive) {
    logger.warn('auth.inactive_user', { userId: String(user._id), path: req.originalUrl });
    throw AppError.forbidden('Your account has been deactivated. Contact your agency administrator.');
  }

  // Role/tenant drift guard: the token must still agree with the stored user.
  if (user.role !== payload.role) {
    logger.warn('auth.role_mismatch', { userId: String(user._id) });
    throw AppError.unauthorized('Authentication token is no longer valid. Please sign in again.');
  }

  req.user = {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId ? String(user.agencyId) : undefined,
    clientId: user.clientId ? String(user.clientId) : undefined,
    isActive: user.isActive,
  };

  next();
});

/**
 * Role gate. Composed *after* `authenticate`.
 *
 * `authorize('AGENCY_ADMIN')` is sufficient on its own, but `resolveTenant` is
 * still required for any route that touches tenant data.
 */
export function authorize(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      logger.warn('authz.role_denied', {
        userId: req.user.id,
        role: req.user.role,
        required: allowed,
        path: req.originalUrl,
      });
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

/**
 * Blocks users whose agency is SUSPENDED or INACTIVE.
 *
 * Super admins are exempt (they operate the platform, not a tenant) and the
 * lookup result is attached to the request so the tenant resolver can reuse it.
 */
export const requireActiveAgency = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  if (user.role === ROLES.SUPER_ADMIN) return next();
  if (!user.agencyId) {
    return next(AppError.forbidden('This account is not attached to an agency'));
  }

  const agency = await Agency.findById(user.agencyId).lean().exec();
  if (!agency) throw AppError.forbidden('The agency for this account no longer exists');

  if (agency.status === AGENCY_STATUS.SUSPENDED) {
    logger.warn('authz.agency_suspended', { userId: user.id, agencyId: user.agencyId });
    throw AppError.forbidden(
      `Agency "${agency.name}" is suspended. Workspace access is disabled. Contact AppZex support.`,
    );
  }

  if (agency.status === AGENCY_STATUS.INACTIVE) {
    throw AppError.forbidden(`Agency "${agency.name}" is inactive. Workspace access is disabled.`);
  }

  res.locals.agency = agency;
  next();
});