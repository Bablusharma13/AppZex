import type { Request, Response } from 'express';
import * as fileService from '../services/file.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendPaginated, sendSuccess } from '../utils/response';
import { actorFrom } from '../utils/actorContext';
import type { ListFilesParams } from '../services/file.service';

export const listFiles = asyncHandler(async (req: Request, res: Response) => {
  const result = await fileService.listFiles(actorFrom(req), req.query as unknown as ListFilesParams);
  return sendPaginated(res, result);
});

/**
 * Uploads a file.
 *
 * `upload.single('file')` has already enforced the size limit and the MIME
 * allow-list, and the metadata is validated by Zod. The stored `agencyId` comes
 * from the resolved tenant, never from the multipart body.
 */
export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('No file was uploaded');

  const meta = req.body as {
    relatedEntityType: 'PROJECT' | 'TASK' | 'FEEDBACK' | 'MEETING';
    relatedEntityId: string;
    visibility: string;
  };

  const result = await fileService.storeFile(actorFrom(req), req.file, meta);
  return sendCreated(res, result);
});

/**
 * Authorised download.
 *
 * There is no public or permanently signed URL: identity, agency, client
 * ownership and visibility are all re-checked here before the stream opens.
 */
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const { file, absolutePath } = await fileService.getAuthorizedFile(actorFrom(req), req.params.id as string);

  const originalName = String(file.originalName);
  // Encode the name so spaces/quotes cannot break out of the header.
  res.setHeader('Content-Type', String(file.mimeType));
  res.setHeader('Content-Length', String(file.size));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(originalName)}"; filename*=UTF-8''${encodeURIComponent(originalName)}`,
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  const { createReadStream } = await import('fs');
  return new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absolutePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
});

export const deleteFile = asyncHandler(async (req: Request, res: Response) => {
  await fileService.deleteFile(actorFrom(req), req.params.id as string);
  return sendSuccess(res, { message: 'File deleted' });
});