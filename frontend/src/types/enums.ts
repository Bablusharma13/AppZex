/**
 * Domain enums.
 *
 * These mirror `backend/src/types/enums.ts` exactly. They are duplicated on
 * purpose: the frontend must never import from the backend workspace, and the
 * API contract is the single shared source of truth that both sides agree on.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  AGENCY_TEAM: 'AGENCY_TEAM',
  CLIENT: 'CLIENT',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const AGENCY_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INACTIVE: 'INACTIVE',
} as const;
export type AgencyStatus = (typeof AGENCY_STATUS)[keyof typeof AGENCY_STATUS];

export const PLANS = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type Plan = (typeof PLANS)[keyof typeof PLANS];

export const PROJECT_STATUS = {
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  COMPLETED: 'COMPLETED',
} as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const TASK_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  DONE: 'DONE',
} as const;
export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const MILESTONE_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[keyof typeof MILESTONE_STATUS];

export const FEEDBACK_STATUS = {
  OPEN: 'OPEN',
  IN_REVIEW: 'IN_REVIEW',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  DECLINED: 'DECLINED',
} as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUS)[keyof typeof FEEDBACK_STATUS];

export const PRIORITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof PRIORITIES)[keyof typeof PRIORITIES];

export const VISIBILITY = {
  INTERNAL: 'INTERNAL',
  CLIENT_VISIBLE: 'CLIENT_VISIBLE',
} as const;
export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

export const SUPPORT_SCOPE = {
  READ_ONLY: 'READ_ONLY',
  READ_WRITE: 'READ_WRITE',
} as const;
export type SupportScope = (typeof SUPPORT_SCOPE)[keyof typeof SUPPORT_SCOPE];

export const FEEDBACK_CATEGORY = {
  GENERAL: 'GENERAL',
  BUG: 'BUG',
  CHANGE_REQUEST: 'CHANGE_REQUEST',
  DESIGN: 'DESIGN',
  CONTENT: 'CONTENT',
} as const;
export type FeedbackCategory =
  (typeof FEEDBACK_CATEGORY)[keyof typeof FEEDBACK_CATEGORY];

export const FILE_ENTITY_TYPE = {
  PROJECT: 'PROJECT',
  TASK: 'TASK',
  FEEDBACK: 'FEEDBACK',
  MEETING: 'MEETING',
} as const;
export type FileEntityType =
  (typeof FILE_ENTITY_TYPE)[keyof typeof FILE_ENTITY_TYPE];

export const SORT_ORDER = { ASC: 'asc', DESC: 'desc' } as const;
export type SortOrder = (typeof SORT_ORDER)[keyof typeof SORT_ORDER];

/** Readable labels for enum values, used by tables and filters. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  REVIEW: 'In review',
  DONE: 'Done',
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  OPEN: 'Open',
  IN_REVIEW: 'In review',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  DECLINED: 'Declined',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const AGENCY_STATUS_LABELS: Record<AgencyStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  INACTIVE: 'Inactive',
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  AGENCY_ADMIN: 'Agency admin',
  AGENCY_TEAM: 'Agency team',
  CLIENT: 'Client',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  INTERNAL: 'Internal',
  CLIENT_VISIBLE: 'Client visible',
};

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  GENERAL: 'General',
  BUG: 'Bug',
  CHANGE_REQUEST: 'Change request',
  DESIGN: 'Design',
  CONTENT: 'Content',
};

/** The home path for a role, used by post-login routing and guards. */
export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: '/admin/dashboard',
  AGENCY_ADMIN: '/workspace',
  AGENCY_TEAM: '/workspace',
  CLIENT: '/client/dashboard',
};

/** The login page a role should use. */
export const ROLE_LOGIN: Record<Role, string> = {
  SUPER_ADMIN: '/admin/login',
  AGENCY_ADMIN: '/login',
  AGENCY_TEAM: '/login',
  CLIENT: '/client/login',
};