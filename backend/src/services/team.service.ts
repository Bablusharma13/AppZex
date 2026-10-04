import { Types } from 'mongoose';
import { User } from '../models/User';
import { AgencyMember } from '../models/AgencyMember';
import { Project } from '../models/Project';
import { AppError } from '../utils/AppError';
import { hashPassword } from '../utils/crypto';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity, notify } from './activity.service';
import { toPublicUser, type PublicUser } from './auth.service';
import { EVENT_TYPES, ROLES } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface TeamMemberDto extends PublicUser {
  assignedProjectCount: number;
}

export interface ListTeamParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  isActive?: boolean;
}

/**
 * Lists agency staff for the caller's tenant.
 *
 * The `agencyId` filter is applied in the query, so a user from another agency
 * can never be listed, invited, edited or deactivated through this service.
 */
export async function listTeam(actor: ActorContext, params: ListTeamParams): Promise<Paginated<TeamMemberDto>> {
  const filter: Record<string, unknown> = {
    agencyId: actor.agencyId,
    role: { $in: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM] },
  };

  if (params.role) filter.role = params.role;
  if (params.isActive !== undefined) filter.isActive = params.isActive;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { jobTitle: rx }];
  }

  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean().exec(),
    User.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toPublicUser(d as never) as TeamMemberDto);
  await attachProjectCounts(items);

  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<TeamMemberDto>;
}

async function attachProjectCounts(items: TeamMemberDto[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => new Types.ObjectId(i.id));

  const rows = await Project.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { projectManagerId: { $in: ids } } },
    { $group: { _id: '$projectManagerId', count: { $sum: 1 } } },
  ]).exec();

  const map = new Map(rows.map((r) => [String(r._id), r.count]));
  for (const item of items) item.assignedProjectCount = map.get(item.id) ?? 0;
}

export async function getTeamMember(actor: ActorContext, userId: string): Promise<TeamMemberDto> {
  const user = await User.findOne({
    _id: userId,
    agencyId: actor.agencyId,
    role: { $in: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM] },
  })
    .lean()
    .exec();

  if (!user) throw AppError.notFound('Team member not found');

  const dto = toPublicUser(user as never) as TeamMemberDto;
  await attachProjectCounts([dto]);
  return dto;
}

/** Invites a new agency staff member. Admin-only (enforced by the route). */
export async function createTeamMember(
  actor: ActorContext,
  input: { name: string; email: string; password: string; role: string; jobTitle?: string; phone?: string },
): Promise<TeamMemberDto> {
  const existing = await User.findOne({ email: input.email }).lean().exec();
  if (existing) throw AppError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    // agencyId is the caller's tenant. A body-supplied agencyId cannot survive
    // validation because Zod strips unknown keys before this point.
    agencyId: actor.agencyId,
    role: input.role,
    jobTitle: input.jobTitle,
    phone: input.phone,
    isActive: true,
  });

  await AgencyMember.create({
    agencyId: actor.agencyId,
    userId: user._id,
    role: input.role,
    jobTitle: input.jobTitle,
    invitedBy: actor.userId,
    joinedAt: new Date(),
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.USER_CREATED,
    relatedEntityType: 'USER',
    relatedEntityId: user._id,
    visibility: 'INTERNAL',
    metadata: { role: input.role, email: input.email },
  });

  await notify({
    agencyId: actor.agencyId,
    recipientId: String(user._id),
    type: 'WELCOME',
    title: 'Welcome to the team',
    body: 'An administrator has added you to the agency workspace.',
  });

  return toPublicUser(user.toObject() as never) as TeamMemberDto;
}

export async function updateTeamMember(
  actor: ActorContext,
  userId: string,
  updates: { name?: string; jobTitle?: string; phone?: string; role?: string; isActive?: boolean },
): Promise<TeamMemberDto> {
  const target = await User.findOne({
    _id: userId,
    agencyId: actor.agencyId,
    role: { $in: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM] },
  }).lean().exec();

  if (!target) throw AppError.notFound('Team member not found');

  // Guard against an admin locking themselves out of their own account.
  if (String(target._id) === actor.userId && updates.isActive === false) {
    throw AppError.badRequest('You cannot deactivate your own account');
  }
  if (String(target._id) === actor.userId && updates.role && updates.role !== target.role) {
    throw AppError.badRequest('You cannot change your own role');
  }

  const updated = await User.findOneAndUpdate(
    { _id: userId, agencyId: actor.agencyId },
    { $set: { ...updates } },
    { new: true, runValidators: true },
  ).lean().exec();

  if (!updated) throw AppError.notFound('Team member not found');

  // Keep the membership projection in step with the user record.
  const memberUpdate: Record<string, unknown> = {};
  if (updates.role) memberUpdate.role = updates.role;
  if (updates.jobTitle !== undefined) memberUpdate.jobTitle = updates.jobTitle;
  if (Object.keys(memberUpdate).length) {
    await AgencyMember.updateOne({ agencyId: actor.agencyId, userId }, { $set: memberUpdate }).exec();
  }

  const eventType =
    updates.isActive === false
      ? EVENT_TYPES.USER_DEACTIVATED
      : updates.isActive === true
        ? EVENT_TYPES.USER_ACTIVATED
        : updates.role
          ? EVENT_TYPES.USER_ROLE_CHANGED
          : EVENT_TYPES.USER_UPDATED;

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType,
    relatedEntityType: 'USER',
    relatedEntityId: userId,
    visibility: 'INTERNAL',
    metadata: { fields: Object.keys(updates), previousRole: target.role },
  });

  return toPublicUser(updated as never) as TeamMemberDto;
}