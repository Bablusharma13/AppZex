import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Types } from 'mongoose';
import { SupportSession } from '../models/SupportSession';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../config/logger';
import { ROLES, type Role } from '../types/enums';
import { safeEqual } from '../utils/crypto';

export const SUPPORT_HEADER = 'x-support-session';

/**
 * Resolves the effective tenant for a request.
 *
 * Precedence, all of it server-side:
 *   1. SUPER_ADMIN + a valid `X-Support-Session` header => the agency recorded
 *      on that (non-expired, non-ended) support session document.
 *   2. Agency user / client => the `agencyId` on the freshly loaded user row.
 *
 * A value supplied in the query string or request body is *never* consulted, so
 * `?agencyId=<other-tenant>` cannot widen access.
 */
export const resolveTenant = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();

  const supportSessionId = req.header(SUPPORT_HEADER);

  if (user.role === ROLES.SUPER_ADMIN) {
    if (!supportSessionId) {
      throw AppError.forbidden('Super admins must start a support session before accessing agency data');
    }

    const session = await SupportSession.findOne({ sessionId: supportSessionId }).lean().exec();

    if (!session || String(session.superAdminId) !== user.id) {
      logger.warn('support.invalid_session', { superAdminId: user.id });
      throw AppError.forbidden('Invalid or expired support session');
    }

    if (session.endedAt) throw AppError.forbidden('This support session has already ended');
    if (session.expiresAt.getTime() <= Date.now()) throw AppError.forbidden('This support session has expired');

    // Defence in depth: never rely on the document lookup comparison alone.
    if (!safeEqual(session.sessionId, supportSessionId)) {
      throw AppError.forbidden('Invalid support session');
    }

    req.tenant = {
      user,
      agencyId: String(session.agencyId),
      isOwnAgency: false,
      supportSessionId: session.sessionId,
      supportScope: session.scope,
    };
    return next();
  }

  if (!user.agencyId) throw AppError.forbidden('This account is not attached to an agency');

  // Guard against a client/agency token being replayed with a support header.
  if (supportSessionId) {
    logger.warn('support.rejected_for_non_super_admin', { userId: user.id });
    throw AppError.forbidden('Support sessions are only available to super admins');
  }

  req.tenant = { user, agencyId: user.agencyId, isOwnAgency: true };
  next();
});

/**
 * Rejects mutating requests performed under a READ_ONLY support session.
 * Read-only support still works for GET/HEAD requests.
 */
export const enforceSupportScope: RequestHandler = (req, _res, next) => {
  const tenant = req.tenant;
  if (!tenant?.supportSessionId) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (tenant.supportScope === 'READ_ONLY') {
    throw AppError.forbidden('This support session is read-only. Restart with read/write scope to make changes.');
  }
  return next();
};

/** Reads the resolved tenant id or fails loudly. */
export function tenantId(req: Request): string {
  const id = req.tenant?.agencyId;
  if (!id) throw AppError.internal('Tenant context missing: resolveTenant must run before controllers');
  if (!Types.ObjectId.isValid(id)) throw AppError.internal('Tenant context is malformed');
  return id;
}

export function currentUserId(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

export function isSupportSession(req: Request): boolean {
  return Boolean(req.tenant?.supportSessionId);
}
/** Blocks client accounts from internal agency endpoints. */
export const requireAgencyStaff: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role === ROLES.CLIENT) {
    return next(AppError.forbidden('This area is restricted to agency staff'));
  }
  return next();
};

/** Blocks agency staff from client-only endpoints. */
export const requireClient: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role !== ROLES.CLIENT) {
    return next(AppError.forbidden('This endpoint is restricted to client accounts'));
  }
  return next();
};

/** Blocks agency staff and clients from platform administration endpoints. */
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role !== ROLES.SUPER_ADMIN) {
    logger.warn('authz.super_admin_denied', { userId: req.user.id, path: req.originalUrl });
    return next(AppError.forbidden('Super admin access only'));
  }
  return next();
};

/** Only an agency that owns the tenant (not a super admin) may do this. */
export const requireOwnAgency: RequestHandler = (req, _res, next) => {
  if (!req.tenant) return next(AppError.unauthorized());
  if (!req.tenant.isOwnAgency) {
    return next(AppError.forbidden('This action must be performed by an agency member'));
  }
  return next();
};

/** Agency roles allowed to administer their own tenant. */
export const requireAgencyAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.role !== ROLES.AGENCY_ADMIN) {
    return next(AppError.forbidden('Only an agency admin can perform this action'));
  }
  return next();
};

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) {
      logger.warn('authz.role_denied', {
        userId: req.user.id, role: req.user.role, required: roles, path: req.originalUrl,
      });
      return next(AppError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

// __APPEND_GUARDS__