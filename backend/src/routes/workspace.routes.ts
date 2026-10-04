import { Router } from 'express';
import * as controller from '../controllers/work.controller';
import { authenticate, requireActiveAgency } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { enforceSupportScope, requireAgencyAdmin, requireAgencyStaff, resolveTenant } from '../middleware/tenant';
import * as teamController from '../controllers/team.controller';
import {
  clientListQuerySchema,
  createClientSchema,
  createClientUserSchema,
  teamListQuerySchema,
  updateClientSchema,
  updateTeamMemberSchema,
} from '../validators/authSchemas';
import {
  createMilestoneSchema,
  createProjectSchema,
  milestoneListQuerySchema,
  projectListQuerySchema,
  updateMilestoneSchema,
  updateProjectSchema,
} from '../validators/projectSchemas';
import { createTeamMemberSchema } from '../validators/authSchemas';
import { objectIdParam } from '../validators/common';

/**
 * Agency workspace routes.
 *
 * Middleware order is deliberate and uniform for every route:
 *   authenticate -> requireActiveAgency -> resolveTenant -> [role gate]
 *   -> enforceSupportScope -> validate -> controller
 *
 * `resolveTenant` must run before any handler so `actorFrom(req)` has a
 * server-derived agency. Nothing here reads an agency id from the request.
 */
const router = Router();

router.use(authenticate, requireActiveAgency, resolveTenant, enforceSupportScope);

// ---------------------------------------------------------------- clients ---

router.get(
  '/clients',
  requireAgencyStaff,
  validate({ query: clientListQuerySchema }),
  controller.listClients,
);
router.get('/clients/:id', requireAgencyStaff, validate({ params: objectIdParam }), controller.getClient);
router.post(
  '/clients',
  requireAgencyAdmin,
  validate({ body: createClientSchema }),
  controller.createClient,
);
router.patch(
  '/clients/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam, body: updateClientSchema }),
  controller.updateClient,
);
router.delete(
  '/clients/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam }),
  controller.deleteClient,
);
router.post(
  '/clients/:id/users',
  requireAgencyAdmin,
  validate({ params: objectIdParam, body: createClientUserSchema }),
  controller.createClientUser,
);

// ------------------------------------------------------------------ team ---

router.get('/team', requireAgencyStaff, validate({ query: teamListQuerySchema }), teamController.listTeam);
router.get('/team/:id', requireAgencyStaff, validate({ params: objectIdParam }), teamController.getTeamMember);
router.post(
  '/team',
  requireAgencyAdmin,
  validate({ body: createTeamMemberSchema }),
  teamController.createTeamMember,
);
router.patch(
  '/team/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam, body: updateTeamMemberSchema }),
  teamController.updateTeamMember,
);

// --------------------------------------------------------------- projects ---

router.get(
  '/projects',
  requireAgencyStaff,
  validate({ query: projectListQuerySchema }),
  controller.listProjects,
);
router.get('/projects/:id', requireAgencyStaff, validate({ params: objectIdParam }), controller.getProject);
router.post(
  '/projects',
  requireAgencyStaff,
  validate({ body: createProjectSchema }),
  controller.createProject,
);
router.patch(
  '/projects/:id',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: updateProjectSchema }),
  controller.updateProject,
);
router.delete(
  '/projects/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam }),
  controller.deleteProject,
);

// ------------------------------------------------------------- milestones ---

router.get(
  '/milestones',
  requireAgencyStaff,
  validate({ query: milestoneListQuerySchema }),
  controller.listMilestones,
);
router.get('/milestones/:id', requireAgencyStaff, validate({ params: objectIdParam }), controller.getMilestone);
router.post(
  '/milestones',
  requireAgencyStaff,
  validate({ body: createMilestoneSchema }),
  controller.createMilestone,
);
router.patch(
  '/milestones/:id',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: updateMilestoneSchema }),
  controller.updateMilestone,
);
router.delete(
  '/milestones/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam }),
  controller.deleteMilestone,
);

export default router;