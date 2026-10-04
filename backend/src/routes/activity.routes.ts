import { Router } from 'express';
import * as activityController from '../controllers/activity.controller';
import * as adminController from '../controllers/admin.controller';
import * as authController from '../controllers/auth.controller';
import { authenticate, requireActiveAgency } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  enforceSupportScope,
  requireAgencyStaff,
  requireClient,
  resolveTenant,
} from '../middleware/tenant';
import { activityListQuerySchema } from '../validators/collabSchemas';

const router = Router();

router.use(authenticate, requireActiveAgency, resolveTenant, enforceSupportScope);

/**
 * Tenant activity feed. Clients only receive CLIENT_VISIBLE entries.
 *
 * Paths are declared relative to the `/api/activity` mount point in
 * `routes/index.ts`, so the feed is `GET /api/activity`.
 */
router.get('/', validate({ query: activityListQuerySchema }), activityController.listActivity);

/** The signed-in user's own client company (client accounts only). */
router.get('/me/client', requireClient, authController.myClient);

router.get('/dashboard', requireAgencyStaff, adminController.agencyDashboard);
router.get('/client/dashboard', requireClient, adminController.clientDashboard);

export default router;