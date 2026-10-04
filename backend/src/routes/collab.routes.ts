import { Router } from 'express';
import * as controller from '../controllers/collab.controller';
import * as workController from '../controllers/work.controller';
import { authenticate, requireActiveAgency } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { aiRateLimiter } from '../middleware/rateLimit';
import { enforceSupportScope, requireAgencyAdmin, requireAgencyStaff, requireClient, resolveTenant } from '../middleware/tenant';
import {
  addTaskCommentSchema,
  createTaskSchema,
  meetingListQuerySchema,
  taskListQuerySchema,
  updateTaskSchema,
} from '../validators/taskSchemas';
import {
  convertActionsSchema,
  createMeetingSchema,
  createFeedbackSchema,
  feedbackListQuerySchema,
  replyFeedbackSchema,
  updateAiSummarySchema,
  updateFeedbackStatusSchema,
  updateMeetingSchema,
} from '../validators/collabSchemas';
import {
  milestoneListQuerySchema,
  projectListQuerySchema,
} from '../validators/projectSchemas';
import { objectIdParam } from '../validators/common';

/**
 * Collaboration routes: tasks, meetings, feedback and the AI workflow.
 * Same middleware contract as the workspace router.
 */
const router = Router();

router.use(authenticate, requireActiveAgency, resolveTenant, enforceSupportScope);

// ------------------------------------------------------------------ tasks ---

router.get('/tasks', requireAgencyStaff, validate({ query: taskListQuerySchema }), controller.listTasks);
router.get('/tasks/:id', requireAgencyStaff, validate({ params: objectIdParam }), controller.getTask);
router.post('/tasks', requireAgencyStaff, validate({ body: createTaskSchema }), controller.createTask);
router.patch(
  '/tasks/:id',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: updateTaskSchema }),
  controller.updateTask,
);
router.delete(
  '/tasks/:id',
  requireAgencyStaff,
  validate({ params: objectIdParam }),
  controller.deleteTask,
);
router.post(
  '/tasks/:id/comments',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: addTaskCommentSchema }),
  controller.addTaskComment,
);

// --------------------------------------------------------------- meetings ---

router.get('/meetings', requireAgencyStaff, validate({ query: meetingListQuerySchema }), controller.listMeetings);
router.get('/meetings/:id', requireAgencyStaff, validate({ params: objectIdParam }), controller.getMeeting);
router.post('/meetings', requireAgencyStaff, validate({ body: createMeetingSchema }), controller.createMeeting);
router.patch(
  '/meetings/:id',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: updateMeetingSchema }),
  controller.updateMeeting,
);
router.delete(
  '/meetings/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam }),
  controller.deleteMeeting,
);

// ---------------------------------------------------------------- feedback ---

router.get('/feedback', requireAgencyStaff, validate({ query: feedbackListQuerySchema }), controller.listFeedback);
router.get('/feedback/:id', requireAgencyStaff, validate({ params: objectIdParam }), controller.getFeedback);
router.patch(
  '/feedback/:id/status',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: updateFeedbackStatusSchema }),
  controller.updateFeedbackStatus,
);
router.post(
  '/feedback/:id/replies',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: replyFeedbackSchema }),
  controller.replyFeedback,
);
router.delete(
  '/feedback/:id',
  requireAgencyAdmin,
  validate({ params: objectIdParam }),
  controller.deleteFeedback,
);

// --------------------------------------------------------------- AI (meetings) -

router.post(
  '/meetings/:id/summary',
  requireAgencyStaff,
  aiRateLimiter,
  validate({ params: objectIdParam }),
  controller.generateSummary,
);
router.patch(
  '/meetings/:id/summary',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: updateAiSummarySchema }),
  controller.saveSummary,
);
router.post(
  '/meetings/:id/summary/tasks',
  requireAgencyStaff,
  validate({ params: objectIdParam, body: convertActionsSchema }),
  controller.convertActions,
);

// ------------------------------------------------------- client-facing ------
// Dedicated client-portal endpoints. These use the same tenant pipeline but
// drop the `requireAgencyStaff` gate so a CLIENT account can reach its own
// data; ownership is enforced by `clientId` scoping inside the services.

router.get('/client/projects', requireClient, validate({ query: projectListQuerySchema }), workController.listProjects);
router.get('/client/projects/:id', requireClient, validate({ params: objectIdParam }), workController.getProject);
router.get('/client/milestones', requireClient, validate({ query: milestoneListQuerySchema }), controller.listClientMilestones);
router.get('/client/meetings', requireClient, validate({ query: meetingListQuerySchema }), controller.listClientMeetings);
router.get('/client/feedback', requireClient, validate({ query: feedbackListQuerySchema }), controller.listFeedback);
router.post('/client/feedback', requireClient, validate({ body: createFeedbackSchema }), controller.createFeedback);
router.post(
  '/client/feedback/:id/replies',
  requireClient,
  validate({ params: objectIdParam, body: replyFeedbackSchema }),
  controller.replyFeedback,
);

export default router;