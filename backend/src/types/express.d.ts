import type { AuthenticatedUser, JwtAccessPayload, TenantContext } from './index';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `authenticate`. */
      user?: AuthenticatedUser;
      /** Set by `resolveTenant`. Always server-derived, never from client input. */
      tenant?: TenantContext;
      /** Parsed request id used for structured logging. */
      requestId?: string;
    }
  }
}

export type { AuthenticatedUser, JwtAccessPayload, TenantContext };