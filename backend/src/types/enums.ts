/**
 * Domain enums shared across models, validators, services and the API contract.
 * These are the single source of truth; never duplicate string literals.
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  AGENCY_ADMIN: 'AGENCY_ADMIN',
  AGENCY_TEAM: 'AGENCY_TEAM',
  CLIENT: 'CLIENT',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ALL_ROLES = Object.values(ROLES) as Role[];

/** Roles that belong to an agency workspace (i.e. carry an `agencyId`). */
export const AGENCY_ROLES: Role[] = [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM];

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

export const PRIORITIES = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof PRIORITIES)[keyof typeof PRIORITIES];

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

export const VISIBILITY = {
  INTERNAL: 'INTERNAL',
  CLIENT_VISIBLE: 'CLIENT_VISIBLE',
} as const;
export type Visibility = (typeof VISIBILITY)[keyof typeof VISIBILITY];

/** Entity kinds an activity log entry can point at. */
export const ENTITY_TYPES = {
  AGENCY: 'AGENCY',
  USER: 'USER',
  CLIENT: 'CLIENT',
  PROJECT: 'PROJECT',
  MILESTONE: 'MILESTONE',
  TASK: 'TASK',
  MEETING: 'MEETING',
  FEEDBACK: 'FEEDBACK',
  FILE: 'FILE',
  SUPPORT_SESSION: 'SUPPORT_SESSION',
} as const;
export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

/**
 * Activity event catalogue. Kept explicit so that dashboards, notification
 * fan-out and the audit trail all agree on the vocabulary.
 */
export const EVENT_TYPES = {
  AGENCY_CREATED: 'agency.created',
  AGENCY_ACTIVATED: 'agency.activated',
  AGENCY_SUSPENDED: 'agency.suspended',
  AGENCY_UPDATED: 'agency.updated',

  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ACTIVATED: 'user.activated',

  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_DELETED: 'client.deleted',

  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_COMPLETED: 'project.completed',
  PROJECT_DELETED: 'project.deleted',

  MILESTONE_CREATED: 'milestone.created',
  MILESTONE_UPDATED: 'milestone.updated',
  MILESTONE_COMPLETED: 'milestone.completed',
  MILESTONE_DELETED: 'milestone.deleted',

  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_ASSIGNED: 'task.assigned',
  TASK_COMPLETED: 'task.completed',
  TASK_DELETED: 'task.deleted',

  MEETING_CREATED: 'meeting.created',
  MEETING_UPDATED: 'meeting.updated',
  MEETING_DELETED: 'meeting.deleted',
  MEETING_SUMMARIZED: 'meeting.summarized',

  FEEDBACK_SUBMITTED: 'feedback.submitted',
  FEEDBACK_RESPONDED: 'feedback.responded',
  FEEDBACK_STATUS_CHANGED: 'feedback.status_changed',
  FEEDBACK_RESOLVED: 'feedback.resolved',
  FEEDBACK_DELETED: 'feedback.deleted',

  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',

  SUPPORT_MODE_ENTERED: 'support_mode.entered',
  SUPPORT_MODE_EXITED: 'support_mode.exited',
  SUPPORT_MODE_ACTION: 'support_mode.action',
} as const;
export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const ACTOR_TYPES = {
  USER: 'USER',
  SYSTEM: 'SYSTEM',
} as const;
export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];

export const SUPPORT_SCOPE = {
  READ_ONLY: 'READ_ONLY',
  READ_WRITE: 'READ_WRITE',
} as const;
export type SupportScope = (typeof SUPPORT_SCOPE)[keyof typeof SUPPORT_SCOPE];