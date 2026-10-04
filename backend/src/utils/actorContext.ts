import type { Request } from 'express';
import { AppError } from '../utils/AppError';
import type { ActorContext } from '../services/client.service';

/**
 * Builds the actor context from the *server-resolved* tenant.
 *
 * This is the only place `agencyId` enters the service layer. It reads
 * `req.tenant.agencyId`, which `resolveTenant` derived from the verified JWT or
 * from a database-verified support session - never from the request itself.
 */
/**
 * Actor context for the service layer.
 *
 * `clientId` is included whenever the caller is a CLIENT account so services can
 * scope to that client's own company. `role` is carried through for the same
 * reason. Both come from the authenticated principal, never from the request.
 */
export function actorFrom(req: Request): ActorContext {
  if (!req.tenant) {
    throw AppError.internal('Tenant context missing: resolveTenant must run before the controller');
  }
  if (!req.user) throw AppError.unauthorized();

  const clientId = req.user.clientId;

  return {
    agencyId: req.tenant.agencyId,
    userId: req.user.id,
    name: req.user.name,
    role: req.user.role,
    ...(clientId ? { clientId } : {}),
    ...(req.tenant.supportSessionId ? { supportSessionId: req.tenant.supportSessionId } : {}),
  };
}

/** Actor context plus the caller's client company, when they have one. */
export function clientActorFrom(req: Request): ActorContext & { clientId?: string } {
  return actorFrom(req);
}

/** Super-admin actor context (platform-level, no tenant). */
export function platformActorFrom(req: Request): { id: string; name: string; email: string } {
  if (!req.user) throw AppError.unauthorized();
  return { id: req.user.id, name: req.user.name, email: req.user.email };
}

/**
 * Returns the client company id when the caller is a CLIENT account.
 * Used to reject agency-only endpoints early with a clear message.
 */
export function requireClientId(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  if (req.user.role !== 'CLIENT' || !req.user.clientId) {
    throw AppError.forbidden('This endpoint requires a client account');
  }
  return req.user.clientId;
}