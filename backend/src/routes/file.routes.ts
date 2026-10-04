import { Router } from 'express';
import multer from 'multer';
import * as controller from '../controllers/file.controller';
import { authenticate, requireActiveAgency } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { enforceSupportScope, requireAgencyAdmin, requireAgencyStaff, resolveTenant } from '../middleware/tenant';
import { fileListQuerySchema, fileMetadataSchema, allowedMimeTypes } from '../validators/collabSchemas';
import { objectIdParam } from '../validators/common';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/**
 * Uploads are buffered in memory (size-capped) and then written by the file
 * service, which generates its own opaque on-disk name. Nothing is served
 * statically, so a guessed filename is useless.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(AppError.badRequest(`Unsupported file type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.use(authenticate, requireActiveAgency, resolveTenant, enforceSupportScope);

/**
 * Files are readable by agency staff and by client accounts (the latter only
 * for CLIENT_VISIBLE files on their own projects - enforced in the service).
 * Uploading and deleting remain staff-only.
 *
 * Paths are declared relative to the `/api/files` mount point in `routes/index.ts`.
 */
router.get('/', validate({ query: fileListQuerySchema }), controller.listFiles);

router.post(
  '/',
  requireAgencyStaff,
  // Metadata is parsed from the multipart body, so it is validated explicitly.
  upload.single('file'),
  validate({ body: fileMetadataSchema }),
  controller.uploadFile,
);

router.get('/:id/download', validate({ params: objectIdParam }), controller.downloadFile);
router.delete('/:id', requireAgencyAdmin, validate({ params: objectIdParam }), controller.deleteFile);

export default router;