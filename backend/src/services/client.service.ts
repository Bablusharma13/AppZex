import { Types } from 'mongoose';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { logActivity, notify } from './activity.service';
import { toPublicUser, type PublicUser } from './auth.service';
import { hashPassword } from '../utils/crypto';
import { EVENT_TYPES, ROLES } from '../types/enums';
import type { Paginated } from '../types';

/** Actor identity, taken from the resolved (server-derived) tenant context. */
export interface ActorContext {
  agencyId: string;
  userId: string;
  name: string;
  role: string;
  /** Present for CLIENT accounts: the client company they represent. */
  clientId?: string;
  /** Set when the actor is a super admin acting through a support session. */
  supportSessionId?: string;
}

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

export interface ClientDto {
  id: string;
  agencyId: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  notes?: string;
  address?: string;
  isActive: boolean;
  projectCount?: number;
  userCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

function toClientDto(doc: Record<string, unknown>): ClientDto {
  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    companyName: doc.companyName as string,
    contactPerson: doc.contactPerson as string,
    email: doc.email as string,
    phone: doc.phone as string | undefined,
    notes: doc.notes as string | undefined,
    address: doc.address as string | undefined,
    isActive: doc.isActive as boolean,
    projectCount: doc.projectCount as number | undefined,
    userCount: doc.userCount as number | undefined,
    createdAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
  };
}

export interface ListClientsParams {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  sortBy: 'createdAt' | 'companyName';
  sortOrder: 'asc' | 'desc';
}

/**
 * Tenant-scoped client listing.
 *
 * `agencyId` comes from the actor context (JWT / verified support session), so
 * there is no code path where a caller can list another tenant's clients.
 */
export async function listClients(actor: ActorContext, params: ListClientsParams): Promise<Paginated<ClientDto>> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };

  if (params.isActive !== undefined) filter.isActive = params.isActive;
  if (params.search) {
    const rx = new RegExp(escapeRegex(params.search), 'i');
    filter.$or = [{ companyName: rx }, { contactPerson: rx }, { email: rx }];
  }

  const sortDirection = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    Client.find(filter)
      .sort({ [params.sortBy]: sortDirection })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    Client.countDocuments(filter).exec(),
  ]);

  const items = docs.map((doc) => toClientDto(doc as unknown as Record<string, unknown>));
  await attachCounts(actor.agencyId, items);

  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<ClientDto>;
}

/** Adds project/user counts to a page of clients without N+1 queries. */
async function attachCounts(agencyId: string, items: ClientDto[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => toObjectId(i.id));

  const [projectCounts, userCounts] = await Promise.all([
    Project.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { agencyId: toObjectId(agencyId), clientId: { $in: ids } } },
      { $group: { _id: '$clientId', count: { $sum: 1 } } },
    ]).exec(),
    User.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { agencyId: toObjectId(agencyId), clientId: { $in: ids } } },
      { $group: { _id: '$clientId', count: { $sum: 1 } } },
    ]).exec(),
  ]);

  const projectMap = new Map(projectCounts.map((c) => [String(c._id), c.count]));
  const userMap = new Map(userCounts.map((c) => [String(c._id), c.count]));

  for (const item of items) {
    item.projectCount = projectMap.get(item.id) ?? 0;
    item.userCount = userMap.get(item.id) ?? 0;
  }
}

export async function getClientById(actor: ActorContext, clientId: string): Promise<ClientDto> {
  const doc = await Client.findOne({ _id: clientId, agencyId: actor.agencyId }).lean().exec();
  // 404 (not 403) so the caller cannot probe for the existence of other tenants' records.
  if (!doc) throw AppError.notFound('Client not found');

  const dto = toClientDto(doc as unknown as Record<string, unknown>);
  const [projectCount, userCount] = await Promise.all([
    Project.countDocuments({ agencyId: actor.agencyId, clientId: clientId }).exec(),
    User.countDocuments({ agencyId: actor.agencyId, clientId: clientId }).exec(),
  ]);
  dto.projectCount = projectCount;
  dto.userCount = userCount;
  return dto;
}

export interface CreateClientInput {
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  notes?: string;
  address?: string;
}

export async function createClient(actor: ActorContext, input: CreateClientInput): Promise<ClientDto> {
  const existing = await Client.findOne({
    agencyId: actor.agencyId,
    companyName: { $regex: `^${escapeRegex(input.companyName)}$`, $options: 'i' },
  })
    .lean()
    .exec();

  if (existing) throw AppError.conflict('A client with this company name already exists');

  const created = await Client.create({ ...input, agencyId: actor.agencyId, isActive: true });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.CLIENT_CREATED,
    relatedEntityType: 'CLIENT',
    relatedEntityId: created._id,
    visibility: 'INTERNAL',
    metadata: { companyName: created.companyName, supportSessionId: actor.supportSessionId },
  });

  return toClientDto(created.toObject() as unknown as Record<string, unknown>);
}

export async function updateClient(
  actor: ActorContext,
  clientId: string,
  updates: Partial<CreateClientInput> & { isActive?: boolean },
): Promise<ClientDto> {
  if (updates.companyName) {
    const clash = await Client.findOne({
      agencyId: actor.agencyId,
      _id: { $ne: clientId },
      companyName: { $regex: `^${escapeRegex(updates.companyName)}$`, $options: 'i' },
    })
      .lean()
      .exec();
    if (clash) throw AppError.conflict('A client with this company name already exists');
  }

  const updated = await Client.findOneAndUpdate(
    { _id: clientId, agencyId: actor.agencyId },
    { $set: updates },
    { new: true, runValidators: true },
  ).lean().exec();

  if (!updated) throw AppError.notFound('Client not found');

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.CLIENT_UPDATED,
    relatedEntityType: 'CLIENT',
    relatedEntityId: clientId,
    visibility: 'INTERNAL',
    metadata: { fields: Object.keys(updates), supportSessionId: actor.supportSessionId },
  });

  return toClientDto(updated as unknown as Record<string, unknown>);
}

/**
 * Creates a CLIENT login for a client company.
 *
 * The `agencyId` and `clientId` are both server-derived: the agency comes from
 * the actor context and the client from the tenant-scoped lookup above. A
 * caller cannot create a login attached to a different agency or company.
 */
export async function createClientUser(
  actor: ActorContext,
  clientId: string,
  input: { name: string; email: string; password: string; jobTitle?: string },
): Promise<PublicUser> {
  const client = await Client.findOne({ _id: clientId, agencyId: actor.agencyId }).lean().exec();
  if (!client) throw AppError.notFound('Client not found');

  const existing = await User.findOne({ email: input.email }).lean().exec();
  if (existing) throw AppError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    role: ROLES.CLIENT,
    agencyId: actor.agencyId,
    clientId: client._id,
    jobTitle: input.jobTitle,
    isActive: true,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.USER_CREATED,
    relatedEntityType: 'USER',
    relatedEntityId: user._id,
    visibility: 'INTERNAL',
    metadata: { clientCompany: client.companyName, role: ROLES.CLIENT },
  });

  await notify({
    agencyId: actor.agencyId,
    recipientId: String(user._id),
    type: 'ACCOUNT_CREATED',
    title: 'Welcome to your client portal',
    body: 'Your agency has created an account for you.',
  });

  return toPublicUser(user.toObject() as never);
}

export async function deleteClient(actor: ActorContext, clientId: string): Promise<void> {
  const client = await Client.findOne({ _id: clientId, agencyId: actor.agencyId }).lean().exec();
  if (!client) throw AppError.notFound('Client not found');

  const projectCount = await Project.countDocuments({ agencyId: actor.agencyId, clientId }).exec();
  if (projectCount > 0) {
    throw AppError.conflict(
      'This client still has projects. Reassign or remove those projects before deleting the client.',
    );
  }

  await User.deleteMany({ agencyId: actor.agencyId, clientId }).exec();
  await Client.deleteOne({ _id: clientId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.CLIENT_DELETED,
    relatedEntityType: 'CLIENT',
    relatedEntityId: clientId,
    visibility: 'INTERNAL',
    metadata: { companyName: client.companyName },
  });
}