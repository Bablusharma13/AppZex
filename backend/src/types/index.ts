import type { Role, Visibility } from './enums';

/** Authenticated principal attached to every protected request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Present for agency users and clients. Absent (undefined) for SUPER_ADMIN. */
  agencyId?: string;
  clientId?: string;
  isActive: boolean;
}

/**
 * Effective access context derived server-side. `agencyId` here is NEVER taken
 * from a request body or query string: it comes from the verified JWT or from a
 * database-verified support session.
 */
export interface TenantContext {
  user: AuthenticatedUser;
  /** Effective tenant for this request (support mode may override the principal's own tenant). */
  agencyId: string;
  /** The acting user belongs to this agency (i.e. is not a super admin impersonating). */
  isOwnAgency: boolean;
  supportSessionId?: string;
  supportScope?: 'READ_ONLY' | 'READ_WRITE';
}

export interface JwtAccessPayload {
  sub: string;
  email: string;
  role: Role;
  agencyId?: string;
  clientId?: string;
  type: 'access';
  jti: string;
  iat: number;
  exp: number;
}

export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ActivityLogInput {
  agencyId: string;
  actorId?: string;
  actorType: 'USER' | 'SYSTEM';
  eventType: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  visibility: Visibility;
  actorName?: string;
  metadata?: Record<string, unknown>;
}