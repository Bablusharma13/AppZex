import { Types } from 'mongoose';
import { Agency } from '../models/Agency';
import { User } from '../models/User';
import { AgencyMember } from '../models/AgencyMember';
import { AppError } from '../utils/AppError';
import { burnPasswordComparison, hashPassword, signAccessToken, signRefreshToken, verifyPassword } from '../utils/crypto';
import { logger } from '../config/logger';
import { logActivity } from './activity.service';
import { AGENCY_STATUS, EVENT_TYPES, PLANS, ROLES, type Role } from '../types/enums';
import type { AuthenticatedUser } from '../types';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  agencyId: string | null;
  clientId: string | null;
  jobTitle?: string;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

export interface UserLean {
  _id: Types.ObjectId;
  name: string;
  email: string;
  role: Role;
  agencyId: Types.ObjectId | null;
  clientId: Types.ObjectId | null;
  jobTitle?: string;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  passwordHash?: string;
}

/**
 * The single place where a user record becomes an API response body.
 * `passwordHash` is never part of the returned shape, so it cannot leak even if
 * a query explicitly selects it.
 */
export function toPublicUser(user: UserLean): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    agencyId: user.agencyId ? String(user.agencyId) : null,
    clientId: user.clientId ? String(user.clientId) : null,
    jobTitle: user.jobTitle,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function toAuthPrincipal(user: UserLean): AuthenticatedUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId ? String(user.agencyId) : undefined,
    clientId: user.clientId ? String(user.clientId) : undefined,
    isActive: user.isActive,
  };
}

export function issueTokens(user: UserLean) {
  const access = signAccessToken({
    userId: String(user._id),
    email: user.email,
    role: user.role,
    agencyId: user.agencyId ? String(user.agencyId) : undefined,
    clientId: user.clientId ? String(user.clientId) : undefined,
  });
  const refresh = signRefreshToken(String(user._id));
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: access.expiresIn,
    refreshTokenId: refresh.jti,
  };
}

export interface RegisterInput {
  agencyName: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
}

/**
 * Public self-service registration: creates a brand-new tenant (agency)
 * together with its first AGENCY_ADMIN.
 *
 * There is deliberately no way to register into an *existing* agency from this
 * endpoint - that is the team-invite flow, which requires an agency admin.
 */
export async function registerAgencyAdmin(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email }).lean().exec();
  if (existing) throw AppError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);

  const agency = await Agency.create({
    name: input.agencyName,
    ownerName: input.name,
    email: input.email,
    phone: input.phone,
    status: AGENCY_STATUS.ACTIVE,
    plan: PLANS.STARTER,
  });

  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: ROLES.AGENCY_ADMIN,
      agencyId: agency._id,
      phone: input.phone,
      isActive: true,
    });

    await AgencyMember.create({
      agencyId: agency._id,
      userId: user._id,
      role: ROLES.AGENCY_ADMIN,
      jobTitle: 'Owner',
      joinedAt: new Date(),
    });

    await logActivity({
      agencyId: agency._id,
      actorId: user._id,
      actorName: user.name,
      eventType: EVENT_TYPES.AGENCY_CREATED,
      relatedEntityType: 'AGENCY',
      relatedEntityId: agency._id,
      metadata: { agencyName: agency.name, via: 'self-registration' },
    });

    await logActivity({
      agencyId: agency._id,
      actorId: user._id,
      actorName: user.name,
      eventType: EVENT_TYPES.USER_REGISTERED,
      relatedEntityType: 'USER',
      relatedEntityId: user._id,
      metadata: { role: user.role },
    });

    const tokens = issueTokens(user as UserLean);
    return { user: toPublicUser(user as UserLean), agency, ...tokens };
  } catch (error) {
    // Do not leave an orphan agency behind if user creation fails.
    await Agency.deleteOne({ _id: agency._id }).exec();
    throw error;
  }
}

export interface LoginInput {
  email: string;
  password: string;
  /** Portal hint only; the stored role remains authoritative. */
  expectedPortal?: Role;
}

export async function login(input: LoginInput) {
  const user = (await User.findOne({ email: input.email.toLowerCase() })
    .select('+passwordHash')
    .lean()
    .exec()) as UserLean | null;

  if (!user) {
    // Equalise timing so a missing account is indistinguishable from a bad password.
    await burnPasswordComparison(input.password);
    logger.warn('auth.login_unknown_email');
    throw AppError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash ?? '');
  if (!passwordMatches) {
    logger.warn('auth.login_bad_password', { userId: String(user._id) });
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated. Contact your agency administrator.');
  }

  // A suspended agency must not be able to sign in at all.
  if (user.role !== ROLES.SUPER_ADMIN && user.agencyId) {
    const agency = await Agency.findById(user.agencyId).lean().exec();
    if (!agency) throw AppError.forbidden('The agency for this account no longer exists');
    if (agency.status === AGENCY_STATUS.SUSPENDED) {
      throw AppError.forbidden(`Agency "${agency.name}" is suspended. Please contact AppZex support.`);
    }
    if (agency.status === AGENCY_STATUS.INACTIVE) {
      throw AppError.forbidden(`Agency "${agency.name}" is inactive. Please contact AppZex support.`);
    }
  }

  if (input.expectedPortal && user.role !== input.expectedPortal) {
    logger.warn('auth.portal_mismatch', {
      userId: String(user._id), expected: input.expectedPortal, actual: user.role,
    });
    throw AppError.forbidden('This account cannot sign in through that portal');
  }

  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() }).exec();

  if (user.agencyId) {
    await logActivity({
      agencyId: user.agencyId,
      actorId: user._id,
      actorName: user.name,
      eventType: EVENT_TYPES.USER_LOGIN,
      relatedEntityType: 'USER',
      relatedEntityId: user._id,
      visibility: 'INTERNAL',
    });
  }

  const tokens = issueTokens(user);
  return { user: toPublicUser(user), ...tokens };
}

export async function getAuthenticatedUser(userId: string): Promise<PublicUser> {
  const user = await User.findById(userId).lean().exec();
  if (!user) throw AppError.unauthorized('Account no longer exists');
  return toPublicUser(user as UserLean);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = (await User.findById(userId).select('+passwordHash').lean().exec()) as UserLean | null;
  if (!user) throw AppError.notFound('User not found');

  const matches = await verifyPassword(currentPassword, user.passwordHash ?? '');
  if (!matches) throw AppError.unauthorized('Current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await User.updateOne({ _id: user._id }, { passwordHash }).exec();

  logger.info('auth.password_changed', { userId: String(user._id) });
}

export async function updateProfile(
  userId: string,
  updates: { name?: string; jobTitle?: string; phone?: string },
): Promise<PublicUser> {
  const user = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true }).lean().exec();
  if (!user) throw AppError.notFound('User not found');
  return toPublicUser(user as UserLean);
}