import { Types } from 'mongoose';
import { ActivityLog, type ActivityLogAttrs } from '../models/ActivityLog';
import { Notification } from '../models/Notification';
import { logger } from '../config/logger';
import { buildPagination, escapeRegex } from '../utils/pagination';
import type { Paginated } from '../types';
import type { Visibility, EntityType } from '../types/enums';

export interface LogEventInput {
  agencyId: string | Types.ObjectId;
  actorId?: string | Types.ObjectId | null;
  actorName: string;
  actorType?: 'USER' | 'SYSTEM';
  eventType: string;
  relatedEntityType?: EntityType;
  relatedEntityId?: string | Types.ObjectId | null;
  visibility?: Visibility;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an activity entry.
 *
 * Logging must never break the primary operation, so failures are swallowed
 * and reported to the logger instead of propagating.
 */
export async function logActivity(input: LogEventInput): Promise<void> {
  try {
    await ActivityLog.create({
      agencyId: new Types.ObjectId(String(input.agencyId)),
      actorId: input.actorId ? new Types.ObjectId(String(input.actorId)) : null,
      actorName: input.actorName.slice(0, 120),
      actorType: input.actorType ?? 'USER',
      eventType: input.eventType,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId ? new Types.ObjectId(String(input.relatedEntityId)) : undefined,
      visibility: input.visibility ?? 'INTERNAL',
      metadata: input.metadata ?? {},
    } satisfies Partial<ActivityLogAttrs>);
  } catch (error) {
    logger.error('activity.log_failed', { eventType: input.eventType, error: (error as Error).message });
  }
}

export interface ActivityQuery {
  page: number;
  limit: number;
  eventType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  actorId?: string;
  visibility?: Visibility;
  from?: Date;
  to?: Date;
  search?: string;
}

/**
 * Tenant-scoped activity feed. The `agencyId` filter is applied here and is
 * never supplied by the caller, which is what makes the feed tenant safe.
 */
export async function listAgencyActivity(
  agencyId: string,
  query: ActivityQuery,
  options: { clientId?: string | null } = {},
): Promise<Paginated<unknown>> {
  const filter: Record<string, unknown> = { agencyId: new Types.ObjectId(agencyId) };

  if (options.clientId) {
    // Client accounts only see events explicitly marked client visible.
    filter.visibility = 'CLIENT_VISIBLE';
    filter.agencyId = new Types.ObjectId(agencyId);
  }

  if (query.eventType) filter.eventType = query.eventType;
  if (query.relatedEntityType) filter.relatedEntityType = query.relatedEntityType;
  if (query.relatedEntityId) filter.relatedEntityId = new Types.ObjectId(query.relatedEntityId);
  if (query.actorId) filter.actorId = new Types.ObjectId(query.actorId);
  if (query.visibility && !options.clientId) filter.visibility = query.visibility;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  if (query.search) {
    filter.$or = [
      { eventType: new RegExp(escapeRegex(query.search), 'i') },
      { actorName: new RegExp(escapeRegex(query.search), 'i') },
    ];
  }

  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean()
      .exec(),
    ActivityLog.countDocuments(filter).exec(),
  ]);

  return { ...buildPagination(query.page, query.limit, total), items } as Paginated<unknown>;
}

/**
 * Creates an in-app notification. Present so that the activity trail can grow
 * into a notification system without a schema migration.
 */
export async function notify(params: {
  agencyId: string;
  recipientId?: string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await Notification.create({
      agencyId: new Types.ObjectId(params.agencyId),
      recipientId: params.recipientId ? new Types.ObjectId(params.recipientId) : null,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
      metadata: params.metadata ?? {},
    });
  } catch (error) {
    logger.error('notification.create_failed', { error: (error as Error).message });
  }
}