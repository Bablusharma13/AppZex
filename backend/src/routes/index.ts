import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import workspaceRoutes from './workspace.routes';
import collabRoutes from './collab.routes';
import fileRoutes from './file.routes';
import activityRoutes from './activity.routes';

/** Single mount point for the whole REST API. */
const router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', service: 'agencyos-api', uptime: process.uptime() },
  });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/workspace', workspaceRoutes);
router.use('/collab', collabRoutes);
router.use('/files', fileRoutes);
router.use('/activity', activityRoutes);

export default router;