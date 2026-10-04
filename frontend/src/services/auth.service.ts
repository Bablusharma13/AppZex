import { apiDelete, apiGet, apiGetPaginated, apiPatch, apiPost } from '@/lib/api-client';
import type {
  ActivityListQuery,
  AgencyDetailDto,
  AgencyListQuery,
  AgencySummary,
  LoginResponse,
  PlatformMetrics,
  PublicUser,
  SupportSessionDto,
} from '@/types/api';
import type { AgencyStatus, Role } from '@/types/enums';

/** Portal a sign-in attempt is made through. */
type Portal = 'admin' | 'agency' | 'client';

/**
 * Maps a portal to the role the account must hold.
 *
 * This is a UX nicety only: the backend enforces the real role, and a token
 * issued for one portal is still rejected by the APIs of the other two.
 */
const PORTAL_ROLE: Record<Portal, Role> = {
  admin: 'SUPER_ADMIN',
  agency: 'AGENCY_TEAM',
  client: 'CLIENT',
};

export interface StartSupportSessionInput {
  agencyId: string;
  reason: string;
  scope: string;
  durationMinutes: number;
}

export interface RegisterInput {
  agencyName: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export type SupportSession = SupportSessionDto;

/** Shared pagination metadata returned by every list endpoint. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export const authService = {
  /** Signs in. `expectedPortal` lets the backend give a clearer error. */
  login(email: string, password: string, portal: Portal): Promise<LoginResponse> {
    return apiPost<LoginResponse>('/auth/login', {
      anonymous: true,
      body: { email, password, expectedPortal: PORTAL_ROLE[portal] },
    });
  },

  /** Ends the session server-side (audit trail). Tokens are discarded locally. */
  logout(): Promise<{ message: string }> {
    return apiPost<{ message: string }>('/auth/logout', { body: {} });
  },

  /** The signed-in principal. Never contains `passwordHash`. */
  me(): Promise<PublicUser> {
    return apiGet<PublicUser>('/auth/me');
  },

  updateProfile(updates: { name?: string; jobTitle?: string; phone?: string }): Promise<PublicUser> {
    return apiPatch<PublicUser>('/auth/me', { body: updates });
  },

  changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return apiPost<{ message: string }>('/auth/change-password', {
      body: { currentPassword, newPassword },
    });
  },

  /** Public self-service signup: creates a new tenant and its first admin. */
  register(input: RegisterInput): Promise<LoginResponse> {
    return apiPost<LoginResponse>('/auth/register', {
      anonymous: true,
      body: input,
    });
  },
};

/** Super admin platform services. Every route requires the SUPER_ADMIN role. */
export const adminService = {
  metrics: () => apiGet<PlatformMetrics>('/admin/metrics'),

  listAgencies: (
    query: AgencyListQuery & { signal?: AbortSignal } = {},
  ): Promise<PageMeta & { items: AgencySummary[] }> =>
    apiGetPaginated<AgencySummary>('/admin/agencies', {
      query,
      signal: query.signal,
    }),

  getAgency: (id: string) => apiGet<AgencySummary>(`/admin/agencies/${id}`),

  getAgencyDetail: (id: string) => apiGet<AgencyDetailDto>(`/admin/agencies/${id}/detail`),

  updateAgency: (id: string, updates: Record<string, string>) =>
    apiPatch<AgencySummary>(`/admin/agencies/${id}`, { body: updates }),

  setAgencyStatus: (id: string, status: AgencyStatus, reason?: string) =>
    apiPatch<AgencySummary>(`/admin/agencies/${id}/status`, { body: { status, reason } }),

  listActivity: (query: ActivityListQuery = {}) =>
    apiGet<unknown>('/admin/activity', { query }),

  listSupportSessions: (agencyId: string) =>
    apiGet<SupportSessionDto[]>(`/admin/agencies/${agencyId}/support-sessions`),

  startSupportSession: (input: StartSupportSessionInput) =>
    apiPost<SupportSessionDto>('/admin/support-session', { body: input }),

  endSupportSession: (sessionId: string) =>
    apiDelete<{ message: string }>('/admin/support-session', { query: { sessionId } }),
};