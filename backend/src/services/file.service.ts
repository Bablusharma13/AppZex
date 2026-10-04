import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';
import { FileAsset, type FileEntityType } from '../models/FileAsset';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Feedback } from '../models/Feedback';
import { Meeting } from '../models/Meeting';
import { Client } from '../models/Client';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { logActivity } from './activity.service';
import { buildPagination, escapeRegex } from '../utils/pagination';
import { EVENT_TYPES, VISIBILITY } from '../types/enums';
import type { Paginated } from '../types';
import type { ActorContext } from './client.service';

export interface FileDto {
  id: string;
  agencyId: string;
  relatedEntityType: FileEntityType;
  relatedEntityId: string;
  projectId?: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedByName: string;
  visibility: string;
  createdAt: Date;
}

/** Storage root. Files are never served statically. */
export function storageRoot(): string {
  return env.storageDir;
}

export function ensureStorageDir(): void {
  fs.mkdirSync(storageRoot(), { recursive: true });
}

/**
 * Maps an upload to its owning project (used for authorisation + filtering).
 * Returns null when the parent entity does not exist inside the tenant.
 */
async function resolveProjectIdForEntity(
  agencyId: string,
  entityType: FileEntityType,
  entityId: string,
): Promise<{ projectId: Types.ObjectId } | null> {
  if (entityType === 'PROJECT') {
    const project = await Project.findOne({ _id: entityId, agencyId }).select('_id').lean().exec();
    return project ? { projectId: project._id as Types.ObjectId } : null;
  }
  if (entityType === 'TASK') {
    const task = await Task.findOne({ _id: entityId, agencyId }).select('projectId').lean().exec();
    return task ? { projectId: task.projectId as Types.ObjectId } : null;
  }
  if (entityType === 'FEEDBACK') {
    const feedback = await Feedback.findOne({ _id: entityId, agencyId }).select('projectId').lean().exec();
    return feedback ? { projectId: feedback.projectId as Types.ObjectId } : null;
  }
  const meeting = await Meeting.findOne({ _id: entityId, agencyId }).select('projectId').lean().exec();
  return meeting ? { projectId: meeting.projectId as Types.ObjectId } : null;
}

/** Confirms the parent entity exists in this tenant before storing a file. */
async function assertEntityInTenant(
  agencyId: string,
  entityType: FileEntityType,
  entityId: string,
): Promise<{ projectId: Types.ObjectId }> {
  const resolved = await resolveProjectIdForEntity(agencyId, entityType, entityId);
  if (!resolved) throw AppError.badRequest('The file must be attached to a valid record in your agency');
  return resolved;
}

/**
 * Stores an uploaded file.
 *
 * The on-disk name is generated (random hex + sanitised extension), so a hostile
 * `originalName` can never influence the path on disk or escape the storage dir.
 */
export async function storeFile(
  actor: ActorContext & { clientId?: string },
  upload: Express.Multer.File,
  meta: { relatedEntityType: FileEntityType; relatedEntityId: string; visibility: string },
): Promise<FileDto> {
  const { projectId } = await assertEntityInTenant(actor.agencyId, meta.relatedEntityType, meta.relatedEntityId);

  ensureStorageDir();

  const extension = path.extname(upload.originalname).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, '');
  const storageKey = `${actor.agencyId}/${Date.now()}-${crypto.randomBytes(16).toString('hex')}${extension}`;
  const absolutePath = path.join(storageRoot(), storageKey);

  // Defensive check: the resolved path must stay inside the storage root.
  if (!absolutePath.startsWith(path.resolve(storageRoot()) + path.sep)) {
    throw AppError.badRequest('Invalid file name');
  }

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  await fs.promises.writeFile(absolutePath, upload.buffer);

  const checksum = crypto.createHash('sha256').update(upload.buffer).digest('hex');

  const created = await FileAsset.create({
    agencyId: actor.agencyId,
    relatedEntityType: meta.relatedEntityType,
    relatedEntityId: meta.relatedEntityId,
    projectId,
    originalName: upload.originalname.slice(0, 255),
    storageKey,
    mimeType: upload.mimetype,
    size: upload.size,
    uploadedBy: actor.userId,
    uploadedByName: actor.name,
    visibility: meta.visibility,
    checksum,
  });

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.FILE_UPLOADED,
    relatedEntityType: 'FILE',
    relatedEntityId: created._id,
    visibility: created.visibility,
    metadata: {
      fileName: created.originalName,
      size: created.size,
      entityType: meta.relatedEntityType,
      entityId: meta.relatedEntityId,
    },
  });

  return toFileDto(created.toObject() as unknown as Record<string, unknown>);
}

function toFileDto(doc: Record<string, unknown>): FileDto {
  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    relatedEntityType: doc.relatedEntityType as FileEntityType,
    relatedEntityId: String(doc.relatedEntityId),
    projectId: doc.projectId ? String(doc.projectId) : undefined,
    originalName: doc.originalName as string,
    mimeType: doc.mimeType as string,
    size: doc.size as number,
    uploadedBy: String(doc.uploadedBy),
    uploadedByName: doc.uploadedByName as string,
    visibility: doc.visibility as string,
    createdAt: doc.createdAt as Date,
  };
}

/**
 * Decides whether `actor` may read `file`.
 *
 * Agency staff (and a super admin inside a support session) may read any file in
 * their tenant. A client account may only read a file that is CLIENT_VISIBLE
 * *and* whose parent record belongs to its own client company. This check runs on
 * every download - there is no public or signed URL shortcut.
 */
export async function canAccessFile(
  actor: ActorContext & { clientId?: string; role?: string },
  file: {
    agencyId: string;
    relatedEntityType: FileEntityType;
    relatedEntityId: string;
    visibility: string;
  },
): Promise<boolean> {
  // Tenant boundary first: a file from another agency is never accessible.
  if (file.agencyId !== actor.agencyId) return false;

  const isStaff =
    actor.role === 'AGENCY_ADMIN' || actor.role === 'AGENCY_TEAM' || actor.role === 'SUPER_ADMIN';
  if (isStaff) return true;

  if (!actor.clientId) return false;
  if (file.visibility !== VISIBILITY.CLIENT_VISIBLE) return false;

  // Narrowed once so the helper below can require a definite string.
  const clientScope: ActorContext & { clientId: string } = { ...actor, clientId: actor.clientId };

  // The parent record must also belong to this client company.
  switch (file.relatedEntityType) {
    case 'PROJECT': {
      const project = await Project.findOne({
        _id: file.relatedEntityId,
        agencyId: actor.agencyId,
        clientId: actor.clientId,
      })
        .select('_id')
        .lean()
        .exec();
      return Boolean(project);
    }
    case 'FEEDBACK': {
      const feedback = await Feedback.findOne({
        _id: file.relatedEntityId,
        agencyId: actor.agencyId,
        clientId: actor.clientId,
      })
        .select('_id')
        .lean()
        .exec();
      return Boolean(feedback);
    }
    case 'TASK': {
      const task = await Task.findOne({
        _id: file.relatedEntityId,
        agencyId: actor.agencyId,
        projectId: { $in: await clientProjectIds(clientScope) },
      })
        .select('_id')
        .lean()
        .exec();
      return Boolean(task);
    }
    case 'MEETING': {
      const meeting = await Meeting.findOne({
        _id: file.relatedEntityId,
        agencyId: actor.agencyId,
        visibility: VISIBILITY.CLIENT_VISIBLE,
        projectId: { $in: await clientProjectIds(clientScope) },
      })
        .select('_id')
        .lean()
        .exec();
      return Boolean(meeting);
    }
    default:
      return false;
  }
}

async function clientProjectIds(actor: ActorContext & { clientId: string }): Promise<Types.ObjectId[]> {
  const projects = await Project.find({ agencyId: actor.agencyId, clientId: actor.clientId })
    .select('_id')
    .lean()
    .exec();
  return projects.map((p) => p._id as Types.ObjectId);
}

export interface AuthorizedFile {
  file: Record<string, unknown>;
  absolutePath: string;
}

/**
 * Loads a file and authorises the download in one step.
 *
 * Returns 404 (not 403) for a file that exists but belongs to someone else, so
 * the endpoint cannot be used to enumerate other tenants' file ids.
 */
export async function getAuthorizedFile(
  actor: ActorContext & { clientId?: string; role?: string },
  fileId: string,
): Promise<AuthorizedFile> {
  const file = await FileAsset.findOne({ _id: fileId, agencyId: actor.agencyId }).lean().exec();
  if (!file) throw AppError.notFound('File not found');

  const allowed = await canAccessFile(actor, {
    agencyId: String(file.agencyId),
    relatedEntityType: file.relatedEntityType,
    relatedEntityId: String(file.relatedEntityId),
    visibility: file.visibility,
  });

  if (!allowed) {
    logger.warn('files.access_denied', { userId: actor.userId, fileId });
    throw AppError.notFound('File not found');
  }

  const absolutePath = path.join(storageRoot(), file.storageKey);
  const resolvedRoot = path.resolve(storageRoot());
  if (!path.resolve(absolutePath).startsWith(resolvedRoot + path.sep)) {
    logger.error('files.path_escape_blocked', { fileId });
    throw AppError.notFound('File not found');
  }

  if (!fs.existsSync(absolutePath)) throw AppError.notFound('File contents are unavailable');

  return { file: file as unknown as Record<string, unknown>, absolutePath };
}

export interface ListFilesParams {
  page: number;
  limit: number;
  projectId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  visibility?: string;
  search?: string;
  sortBy: 'createdAt' | 'size' | 'originalName';
  sortOrder: 'asc' | 'desc';
}

/** Lists files for the tenant, optionally filtered to a project/entity. */
export async function listFiles(
  actor: ActorContext & { clientId?: string; role?: string },
  params: ListFilesParams,
): Promise<Paginated<FileDto>> {
  const filter: Record<string, unknown> = { agencyId: actor.agencyId };

  const isStaff =
    actor.role === 'AGENCY_ADMIN' || actor.role === 'AGENCY_TEAM' || actor.role === 'SUPER_ADMIN';
  if (!isStaff) {
    if (!actor.clientId) throw AppError.forbidden('Not permitted');
    // Clients only see CLIENT_VISIBLE files on their own projects.
    filter.visibility = VISIBILITY.CLIENT_VISIBLE;
    filter.projectId = { $in: await clientProjectIds({ ...actor, clientId: actor.clientId }) };
  }

  if (params.projectId) filter.projectId = params.projectId;
  if (params.relatedEntityType) filter.relatedEntityType = params.relatedEntityType;
  if (params.relatedEntityId) filter.relatedEntityId = params.relatedEntityId;
  // Only staff may filter by visibility. A client is pinned to CLIENT_VISIBLE
  // above, and honouring this parameter for them could only ever restrict the
  // result set, so it is deliberately ignored to keep the rule in one place.
  if (isStaff && params.visibility) filter.visibility = params.visibility;
  if (params.search) filter.originalName = new RegExp(escapeRegex(params.search), 'i');

  const direction = params.sortOrder === 'asc' ? 1 : -1;
  const skip = (params.page - 1) * params.limit;

  const [docs, total] = await Promise.all([
    FileAsset.find(filter)
      .sort({ [params.sortBy]: direction })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    FileAsset.countDocuments(filter).exec(),
  ]);

  const items = docs.map((d) => toFileDto(d as unknown as Record<string, unknown>));
  return { ...buildPagination(params.page, params.limit, total), items } as Paginated<FileDto>;
}

/** Deletes a file and removes it from disk. */
export async function deleteFile(actor: ActorContext, fileId: string): Promise<void> {
  const file = await FileAsset.findOne({ _id: fileId, agencyId: actor.agencyId }).lean().exec();
  if (!file) throw AppError.notFound('File not found');

  const absolutePath = path.join(storageRoot(), file.storageKey);
  try {
    if (fs.existsSync(absolutePath)) await fs.promises.unlink(absolutePath);
  } catch (error) {
    logger.warn('files.unlink_failed', { fileId, error: (error as Error).message });
  }

  await FileAsset.deleteOne({ _id: fileId, agencyId: actor.agencyId }).exec();

  await logActivity({
    agencyId: actor.agencyId,
    actorId: actor.userId,
    actorName: actor.name,
    eventType: EVENT_TYPES.FILE_DELETED,
    relatedEntityType: 'FILE',
    relatedEntityId: fileId,
    visibility: 'INTERNAL',
    metadata: { fileName: file.originalName },
  });
}

/** Client company name, used by the client portal header. */
export async function getClientCompany(clientId: string, agencyId: string): Promise<string | null> {
  const client = await Client.findOne({ _id: clientId, agencyId }).select('companyName').lean().exec();
  return client?.companyName ?? null;
}