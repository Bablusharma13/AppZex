import { Types } from 'mongoose';
import crypto from 'crypto';
import { Agency } from '../models/Agency';
import { User } from '../models/User';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Feedback } from '../models/Feedback';
import { ActivityLog } from '../models/ActivityLog';
import { SupportSession } from '../models/SupportSession';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { logActivity } from './activity.service';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { AGENCY_STATUS, EVENT_TYPES, ROLES } from '../types/enums';
import type { Paginated } from '../types';

export interface PlatformActor {
  id: string;
  name: string;
  email: string;
}

export interface AgencySummary {
  id: string;
  name: string;
  ownerName: string;
  email: string;
  phone?: string;
  status: string;
  plan: string;
  address?: string;
  website?: string;
  suspensionReason?: string;
  suspendedAt?: Date;
  userCount: number;
  clientCount: number;
  projectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListAgenciesParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  plan?: string;
  sortBy: 'createdAt' | 'name' | 'status';
  sortOrder: 'asc' | 'desc';
}

function toAgencySummary(doc: Record<string, unknown>): AgencySummary {
  return {
    id: String(doc._id),
    name: doc.name as string,
    ownerName: doc.ownerName as string,
    email: doc.email as string,
    phone: doc.phone as string | undefined,
    status: doc.status as string,
    plan: doc.plan as string,
    address: doc.address as string | undefined,
    website: doc.website as string | undefined,
    suspensionReason: doc.suspensionReason as string | undefined,
    suspendedAt: doc.suspendedAt as Date | undefined,
    userCount: 0,
    clientCount: 0,
    projectCount: 0,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

async function attachAgencyCounts(items: AgencySummary[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => new Types.ObjectId(i.id));

  const [users, clients, projects] = await Promise.all([
    User.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { agencyId: { $in: ids }, role: { $in: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM] } } },
      { $group: { _id: '$agencyId', count: { $sum: 1 } } },
    ]).exec(),
    Client.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { agencyId: { $in: ids } } },
      { $group: { _id: '$agencyId', count: { $sum: 1 } } },
    ]).exec(),
    Project.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { agencyId: { $in: ids } } },
      { $group: { _id: '$agencyId', count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const toMap = (rows: { _id: Types.ObjectId; count: number }[]) =>
    new Map(rows.map((r) => [String(r._id), r.count]));

  const userMap = toMap(users);
  const clientMap = toMap(clients);
  const projectMap = toMap(projects);

  for (const item of items) {
    item.userCount = userMap.get(item.id) ?? 0;
    item.clientCount = clientMap.get(item.id) ?? 0;
    item.projectCount = projectMap.get(item.id) ?? 0;
  }
}

/** Platform-wide agency list with aggregate counts. */
export async function listAgencies(params: ListAgenciesParams): Promise<Paginated<AgencySummary>> {
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  if (params.plan) filter.plan = params.plan;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { ownerName: rx }];
  }

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Agency.find(filter)
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Agency.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toAgencySummary(d as unknown as Record<string, unknown>));
  await attachAgencyCounts(items);

  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<AgencySummary>;
}

export async function getAgencyById(agencyId: string): Promise<AgencySummary> {
  const doc = await Agency.findById(agencyId).lean().exec();
  if (!doc) throw AppError.notFound('Agency not found');

  const summary = toAgencySummary(doc as unknown as Record<string, unknown>);
  await attachAgencyCounts([summary]);
  return summary;
}

export interface PlatformMetrics {
  totalAgencies: number;
  activeAgencies: number;
  suspendedAgencies: number;
  inactiveAgencies: number;
  totalUsers: number;
  totalClientCompanies: number;
  totalProjects: number;
  totalTasks: number;
  agenciesByPlan: Record<string, number>;
  recentActivity: unknown[];
}

/** Platform-wide dashboard metrics for the super admin. */
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const [
    totalAgencies,
    activeAgencies,
    suspendedAgencies,
    inactiveAgencies,
    totalUsers,
    totalClientCompanies,
    totalProjects,
    totalTasks,
    planRows,
    recentActivity,
  ] = await Promise.all([
    Agency.countDocuments().exec(),
    Agency.countDocuments({ status: AGENCY_STATUS.ACTIVE }).exec(),
    Agency.countDocuments({ status: AGENCY_STATUS.SUSPENDED }).exec(),
    Agency.countDocuments({ status: AGENCY_STATUS.INACTIVE }).exec(),
    // Counted with an aggregation rather than `countDocuments({ role: ... })`:
    // `sanitizeFilter` (enabled globally in config/database.ts for NoSQL-injection
    // protection) rewrites operator filters on indexed paths, which Mongoose then
    // fails to cast. Aggregations bypass query casting entirely.
    User.aggregate<{ count: number }>([
      { $match: { role: { $in: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM, ROLES.CLIENT] } } },
      { $count: 'count' },
    ]).exec()
      .then((rows) => rows[0]?.count ?? 0),
    Client.countDocuments().exec(),
    Project.countDocuments().exec(),
    Task.countDocuments().exec(),
    Agency.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$plan', count: { $sum: 1 } } }]).exec(),
    ActivityLog.find({}).sort({ createdAt: -1 }).limit(15).lean().exec(),
  ]);

  const agenciesByPlan: Record<string, number> = {};
  for (const row of planRows) agenciesByPlan[row._id] = row.count;

  return {
    totalAgencies,
    activeAgencies,
    suspendedAgencies,
    inactiveAgencies,
    totalUsers,
    totalClientCompanies,
    totalProjects,
    totalTasks,
    agenciesByPlan,
    recentActivity,
  };
}

/**
 * Changes an agency's status. Suspending an agency immediately blocks its users
 * at login and on every protected request (`requireActiveAgency`).
 */
export async function setAgencyStatus(
  actor: PlatformActor,
  agencyId: string,
  status: string,
  reason?: string,
): Promise<AgencySummary> {
  const agency = await Agency.findById(agencyId).lean().exec();
  if (!agency) throw AppError.notFound('Agency not found');

  const update: Record<string, unknown> = { status };
  if (status === AGENCY_STATUS.SUSPENDED) {
    update.suspendedAt = new Date();
    update.suspensionReason = reason ?? 'No reason provided';
  } else {
    update.suspendedAt = null;
    update.suspensionReason = null;
  }

  const updated = await Agency.findByIdAndUpdate(agencyId, { $set: update }, { new: true, runValidators: true })
    .lean()
    .exec();
  if (!updated) throw AppError.notFound('Agency not found');

  await logActivity({
    agencyId,
    actorId: actor.id,
    actorName: actor.name,
    eventType: status === AGENCY_STATUS.SUSPENDED ? EVENT_TYPES.AGENCY_SUSPENDED : EVENT_TYPES.AGENCY_ACTIVATED,
    relatedEntityType: 'AGENCY',
    relatedEntityId: agencyId,
    visibility: 'INTERNAL',
    metadata: { previousStatus: agency.status, newStatus: status, reason: reason ?? null },
  });

  logger.info('admin.agency_status_changed', {
    actorId: actor.id,
    agencyId,
    previousStatus: agency.status,
    newStatus: status,
  });

  const summary = toAgencySummary(updated as unknown as Record<string, unknown>);
  await attachAgencyCounts([summary]);
  return summary;
}

export async function updateAgency(
  actor: PlatformActor,
  agencyId: string,
  updates: Record<string, unknown>,
): Promise<AgencySummary> {
  const updated = await Agency.findByIdAndUpdate(agencyId, { $set: updates }, { new: true, runValidators: true })
    .lean()
    .exec();
  if (!updated) throw AppError.notFound('Agency not found');

  await logActivity({
    agencyId,
    actorId: actor.id,
    actorName: actor.name,
    eventType: EVENT_TYPES.AGENCY_UPDATED,
    relatedEntityType: 'AGENCY',
    relatedEntityId: agencyId,
    visibility: 'INTERNAL',
    metadata: { fields: Object.keys(updates) },
  });

  const summary = toAgencySummary(updated as unknown as Record<string, unknown>);
  await attachAgencyCounts([summary]);
  return summary;
}

export interface SupportSessionDto {
  sessionId: string;
  agencyId: string;
  agencyName: string;
  agencyStatus: string;
  superAdminId: string;
  superAdminName: string;
  scope: string;
  reason: string;
  expiresAt: Date;
  endedAt?: Date;
  privilegedActionCount: number;
  createdAt: Date;
}

/**
 * Opens a support session.
 *
 * The browser receives an opaque, high-entropy `sessionId` and nothing else. The
 * agency it grants access to lives only in the database, and `resolveTenant`
 * re-reads it on every request. Sending `?agencyId=<other>` therefore has no
 * effect: the header value alone is not enough, and it is not even accepted
 * unless it matches a live session owned by the caller.
 */
export async function startSupportSession(
  actor: PlatformActor,
  input: { agencyId: string; reason: string; scope: string; durationMinutes: number },
  context: { ip?: string; userAgent?: string } = {},
): Promise<SupportSessionDto> {
  const agency = await Agency.findById(input.agencyId).lean().exec();
  if (!agency) throw AppError.notFound('Agency not found');

  // End any session this admin already has open for that agency.
  // End any session this admin already has open for that agency.
  await SupportSession.updateMany(
    {
      sessionId: { $exists: true },
      superAdminId: actor.id,
      agencyId: input.agencyId,
      endedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { endedAt: new Date(), endedReason: 'Replaced by a new session' } },
  ).exec();

  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + input.durationMinutes * 60 * 1000);

  await SupportSession.create({
    sessionId,
    agencyId: agency._id,
    superAdminId: actor.id,
    superAdminName: actor.name,
    scope: input.scope,
    reason: input.reason,
    ipAddress: context.ip,
    userAgent: context.userAgent?.slice(0, 300),
    expiresAt,
  });

  await logActivity({
    agencyId: agency._id,
    actorId: actor.id,
    actorName: actor.name,
    eventType: EVENT_TYPES.SUPPORT_MODE_ENTERED,
    relatedEntityType: 'SUPPORT_SESSION',
    relatedEntityId: agency._id,
    visibility: 'INTERNAL',
    metadata: { scope: input.scope, reason: input.reason, expiresAt, ip: context.ip ?? null },
  });

  logger.info('support.session_started', {
    superAdminId: actor.id,
    agencyId: String(agency._id),
    scope: input.scope,
    expiresAt,
  });

  return {
    sessionId,
    agencyId: String(agency._id),
    agencyName: agency.name,
    agencyStatus: agency.status,
    superAdminId: actor.id,
    superAdminName: actor.name,
    scope: input.scope,
    reason: input.reason,
    expiresAt,
    privilegedActionCount: 0,
    createdAt: new Date(),
  };
}

/** Ends a support session. Safe to call repeatedly. */
export async function endSupportSession(actor: PlatformActor, sessionId: string): Promise<void> {
  const session = await SupportSession.findOne({ sessionId, superAdminId: actor.id }).lean().exec();
  if (!session) throw AppError.notFound('Support session not found');
  if (session.endedAt) return;

  await SupportSession.updateOne(
    { sessionId, superAdminId: actor.id },
    { $set: { endedAt: new Date(), endedReason: 'Ended by super admin' } },
  ).exec();

  await logActivity({
    agencyId: session.agencyId,
    actorId: actor.id,
    actorName: actor.name,
    eventType: EVENT_TYPES.SUPPORT_MODE_EXITED,
    relatedEntityType: 'SUPPORT_SESSION',
    relatedEntityId: session.agencyId,
    visibility: 'INTERNAL',
    metadata: {
      reason: session.reason,
      scope: session.scope,
      privilegedActionCount: session.privilegedActionCount,
    },
  });

  logger.info('support.session_ended', { superAdminId: actor.id, agencyId: String(session.agencyId) });
}

/** Current session state, used by the frontend support-mode banner. */
export async function getSupportSession(actor: PlatformActor, sessionId: string): Promise<SupportSessionDto> {
  const session = await SupportSession.findOne({ sessionId, superAdminId: actor.id }).lean().exec();
  if (!session) throw AppError.notFound('Support session not found');

  const agency = await Agency.findById(session.agencyId).lean().exec();

  return {
    sessionId: session.sessionId,
    agencyId: String(session.agencyId),
    agencyName: agency?.name ?? 'Unknown agency',
    agencyStatus: agency?.status ?? AGENCY_STATUS.INACTIVE,
    superAdminId: String(session.superAdminId),
    superAdminName: session.superAdminName,
    scope: session.scope,
    reason: session.reason,
    expiresAt: session.expiresAt,
    endedAt: session.endedAt,
    privilegedActionCount: session.privilegedActionCount,
    createdAt: session.createdAt,
  };
}

/**
 * Records that a privileged (mutating) action was taken during a support
 * session, so every write made in support mode is auditable.
 */
export async function recordPrivilegedAction(
  sessionId: string,
  action: { method: string; path: string },
): Promise<void> {
  try {
    await SupportSession.updateOne({ sessionId }, { $inc: { privilegedActionCount: 1 } }).exec();
    logger.info('support.privileged_action', { sessionId, method: action.method, path: action.path });
  } catch (error) {
    logger.error('support.privileged_action_log_failed', { sessionId, error: (error as Error).message });
  }
}

/** Support session history for the agency detail view. */
export async function listSupportSessions(agencyId: string, limit = 25): Promise<SupportSessionDto[]> {
  const sessions = await SupportSession.find({ agencyId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  return sessions.map((s) => ({
    sessionId: s.sessionId,
    agencyId: String(s.agencyId),
    agencyName: '',
    agencyStatus: '',
    superAdminId: String(s.superAdminId),
    superAdminName: s.superAdminName,
    scope: s.scope,
    reason: s.reason,
    expiresAt: s.expiresAt,
    endedAt: s.endedAt,
    privilegedActionCount: s.privilegedActionCount,
    createdAt: s.createdAt,
  }));
}

/** Platform activity feed across all tenants (super admin only). */
export async function listPlatformActivity(params: {
  page: number;
  limit: number;
  eventType?: string;
  agencyId?: string;
  actorType?: string;
  from?: Date;
  to?: Date;
}): Promise<Paginated<unknown>> {
  const filter: Record<string, unknown> = {};
  if (params.eventType) filter.eventType = params.eventType;
  if (params.agencyId) filter.agencyId = new Types.ObjectId(params.agencyId);
  if (params.actorType) filter.actorType = params.actorType;
  if (params.from || params.to) {
    filter.createdAt = {
      ...(params.from ? { $gte: params.from } : {}),
      ...(params.to ? { $lte: params.to } : {}),
    };
  }

  const skip = (params.page - 1) * params.limit;
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean().exec(),
    ActivityLog.countDocuments(filter).exec(),
  ]);

  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<unknown>;
}

/** Aggregated agency detail used by the super admin agency page. */
export async function getAgencyDetail(agencyId: string) {
  const agency = await getAgencyById(agencyId);
  const [users, clients, projects, feedbackCount, activity, supportSessions] = await Promise.all([
    User.find({ agencyId, role: { $in: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM] } })
      .select('name email role isActive jobTitle lastLoginAt createdAt')
      .lean()
      .exec(),
    Client.find({ agencyId }).select('companyName contactPerson email createdAt').limit(50).lean().exec(),
    Project.find({ agencyId })
      .select('name status priority createdAt expectedCompletionDate')
      .limit(50)
      .lean()
      .exec(),
    Feedback.countDocuments({ agencyId }).exec(),
    ActivityLog.find({ agencyId }).sort({ createdAt: -1 }).limit(20).lean().exec(),
    listSupportSessions(agencyId, 10),
  ]);

  return { agency, users, clients, projects, feedbackCount, activity, supportSessions };
}