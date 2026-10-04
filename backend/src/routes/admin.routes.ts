import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/admin.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import {
  enforceSupportScope,
  requireAgencyAdmin,
  requireAgencyStaff,
  requireSuperAdmin,
  resolveTenant,
} from '../middleware/tenant';
import {
  agencyListQuerySchema,
  createTeamMemberSchema,
  platformActivityQuerySchema,
  supportSessionSchema,
  teamListQuerySchema,
  updateAgencySchema,
  updateTeamMemberSchema,
} from '../validators/authSchemas';
import { objectIdParam } from '../validators/common';
import { AGENCY_STATUS } from '../types/enums';

const router = Router();

/** Every /admin route requires an authenticated principal. */
router.use(authenticate);

// ------------------------------------------------------ platform metrics ----

router.get('/metrics', requireSuperAdmin, controller.getMetrics);

// ------------------------------------------------------------- agencies ----

router.get(
  '/agencies',
  requireSuperAdmin,
  validate({ query: agencyListQuerySchema }),
  controller.listAgencies,
);

router.get(
  '/agencies/:id',
  requireSuperAdmin,
  validate({ params: objectIdParam }),
  controller.getAgency,
);

router.get(
  '/agencies/:id/detail',
  requireSuperAdmin,
  validate({ params: objectIdParam }),
  controller.getAgencyDetail,
);

router.patch(
  '/agencies/:id',
  requireSuperAdmin,
  enforceSupportScope,
  validate({ params: objectIdParam, body: updateAgencySchema }),
  controller.updateAgency,
);

router.patch(
  '/agencies/:id/status',
  requireSuperAdmin,
  validate({
    params: objectIdParam,
    body: z.object({
      status: z.enum(Object.values(AGENCY_STATUS) as [string, ...string[]]),
      reason: z.string().trim().max(400).optional(),
    }),
  }),
  controller.setAgencyStatus,
);

router.get(
  '/agencies/:id/support-sessions',
  requireSuperAdmin,
  validate({ params: objectIdParam }),
  controller.listAgencySupportSessions,
);

// ---------------------------------------------------------- support mode ---

router.post(
  '/support-session',
  requireSuperAdmin,
  validate({ body: supportSessionSchema }),
  controller.startSupportSession,
);

router.get('/support-session', requireSuperAdmin, controller.getSupportSession);
router.delete('/support-session', requireSuperAdmin, controller.endSupportSession);

// -------------------------------------------------------------- activity ---

router.get(
  '/activity',
  requireSuperAdmin,
  validate({ query: platformActivityQuerySchema }),
  controller.listPlatformActivity,
);

// --------------------------------------------- agency-scoped (support) ------
// These use the normal tenant pipeline: `resolveTenant` reads the agency from
// the database-verified support session header, never from a query parameter.

router.get(
  '/workspace/projects',
  requireSuperAdmin,
  resolveTenant,
  enforceSupportScope,
  controller.agencyDashboard,
);

router.get(
  '/workspace/team',
  requireSuperAdmin,
  resolveTenant,
  enforceSupportScope,
  validate({ query: teamListQuerySchema }),
  controller.listTeam,
);

router.post(
  '/workspace/team',
  requireSuperAdmin,
  resolveTenant,
  enforceSupportScope,
  requireAgencyAdmin,
  validate({ body: createTeamMemberSchema }),
  controller.createTeamMember,
);

router.patch(
  '/workspace/team/:id',
  requireSuperAdmin,
  resolveTenant,
  enforceSupportScope,
  requireAgencyAdmin,
  validate({ params: objectIdParam, body: updateTeamMemberSchema }),
  controller.updateTeamMember,
);

export { requireAgencyStaff };
export default router;