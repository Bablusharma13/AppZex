import { Types } from 'mongoose';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { Feedback } from '../models/Feedback';
import { Meeting } from '../models/Meeting';
import { FileAsset } from '../models/FileAsset';
import { listAgencyActivity } from './activity.service';
import { FEEDBACK_STATUS, PROJECT_STATUS } from '../types/enums';

export interface ClientDashboard {
  companyName: string;
  activeProjects: number;
  completedProjects: number;
  pendingActions: number;
  openFeedback: number;
  clientVisibleMeetings: number;
  sharedFiles: number;
  upcomingDeadlines: { id: string; name: string; expectedCompletionDate: Date }[];
  recentActivity: unknown[];
}

/** Project ids owned by one client company inside one tenant. */
export async function clientProjectIds(agencyOid: Types.ObjectId, clientOid: Types.ObjectId): Promise<Types.ObjectId[]> {
  const projects = await Project.find({ agencyId: agencyOid, clientId: clientOid })
    .select('_id')
    .lean()
    .exec();
  return projects.map((p) => p._id as Types.ObjectId);
}

/**
 * Client portal dashboard.
 *
 * Scoped twice: by `agencyId` *and* by the caller's own `clientId`, so a client
 * can only ever see aggregates for their own company.
 */
export async function getClientDashboard(agencyId: string, clientId: string): Promise<ClientDashboard> {
  const agencyOid = new Types.ObjectId(agencyId);
  const clientOid = new Types.ObjectId(clientId);
  const in14Days = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const projectIds = await clientProjectIds(agencyOid, clientOid);

  const [client, activeProjects, completedProjects, openFeedback, meetings, files, projects, activity] =
    await Promise.all([
      Client.findOne({ _id: clientOid, agencyId: agencyOid }).select('companyName').lean().exec(),
      Project.countDocuments({ agencyId: agencyOid, clientId: clientOid, status: PROJECT_STATUS.ACTIVE }).exec(),
      Project.countDocuments({ agencyId: agencyOid, clientId: clientOid, status: PROJECT_STATUS.COMPLETED }).exec(),
      Feedback.countDocuments({
        agencyId: agencyOid,
        clientId: clientOid,
        status: { $in: [FEEDBACK_STATUS.OPEN, FEEDBACK_STATUS.IN_REVIEW, FEEDBACK_STATUS.IN_PROGRESS] },
      }).exec(),
      Meeting.countDocuments({
        agencyId: agencyOid,
        visibility: 'CLIENT_VISIBLE',
        projectId: { $in: projectIds },
      }).exec(),
      FileAsset.countDocuments({
        agencyId: agencyOid,
        visibility: 'CLIENT_VISIBLE',
        projectId: { $in: projectIds },
      }).exec(),
      Project.find({
        agencyId: agencyOid,
        clientId: clientOid,
        status: { $ne: PROJECT_STATUS.COMPLETED },
        expectedCompletionDate: { $ne: null, $lte: in14Days },
      })
        .select('name expectedCompletionDate')
        .sort({ expectedCompletionDate: 1 })
        .limit(10)
        .lean()
        .exec(),
      listAgencyActivity(agencyId, { page: 1, limit: 10 }, { clientId }),
    ]);

  return {
    companyName: client?.companyName ?? 'Your company',
    activeProjects,
    completedProjects,
    pendingActions: openFeedback,
    openFeedback,
    clientVisibleMeetings: meetings,
    sharedFiles: files,
    upcomingDeadlines: projects.map((p) => ({
      id: String(p._id),
      name: p.name,
      expectedCompletionDate: p.expectedCompletionDate as Date,
    })),
    recentActivity: activity.items,
  };
}