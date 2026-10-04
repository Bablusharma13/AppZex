import { Types } from 'mongoose';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { Feedback } from '../models/Feedback';
import { Milestone } from '../models/Milestone';
import { listAgencyActivity } from './activity.service';
import { FEEDBACK_STATUS, PROJECT_STATUS, TASK_STATUS } from '../types/enums';

/** Reads a populated ref that Mongoose's lean() typings do not model. */
function ref<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object') return null;
  return value as T;
}

export interface AgencyDashboard {
  totalClients: number;
  activeProjects: number;
  projectsDueSoon: number;
  completedProjects: number;
  totalProjects: number;
  onHoldProjects: number;
  pendingFeedback: number;
  overdueTasks: number;
  openTasks: number;
  totalTasks: number;
  upcomingDeadlines: {
    tasks: { id: string; title: string; dueDate: Date; projectName: string; assigneeName?: string }[];
    milestones: { id: string; name: string; dueDate: Date; projectName: string }[];
    projects: { id: string; name: string; expectedCompletionDate: Date }[];
  };
  projectStatusDistribution: Record<string, number>;
  taskStatusDistribution: Record<string, number>;
  feedbackStatusDistribution: Record<string, number>;
  recentActivity: unknown[];
}

/**
 * Agency workspace dashboard.
 *
 * Every count is scoped by `agencyId`. Progress shown elsewhere is derived from
 * the task collection rather than a stored counter.
 */
export async function getAgencyDashboard(agencyId: string): Promise<AgencyDashboard> {
  const oid = new Types.ObjectId(agencyId);
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    totalClients, activeProjects, completedProjects, totalProjects, onHoldProjects,
    projectsDueSoon, pendingFeedback, overdueTasks, openTasks, totalTasks,
  ] = await Promise.all([
    Client.countDocuments({ agencyId: oid }).exec(),
    Project.countDocuments({ agencyId: oid, status: PROJECT_STATUS.ACTIVE }).exec(),
    Project.countDocuments({ agencyId: oid, status: PROJECT_STATUS.COMPLETED }).exec(),
    Project.countDocuments({ agencyId: oid }).exec(),
    Project.countDocuments({ agencyId: oid, status: PROJECT_STATUS.ON_HOLD }).exec(),
    Project.countDocuments({
      agencyId: oid, status: { $ne: PROJECT_STATUS.COMPLETED },
      expectedCompletionDate: { $ne: null, $lte: in14Days },
    }).exec(),
    Feedback.countDocuments({
      agencyId: oid,
      status: { $in: [FEEDBACK_STATUS.OPEN, FEEDBACK_STATUS.IN_REVIEW, FEEDBACK_STATUS.IN_PROGRESS] },
    }).exec(),
    Task.countDocuments({ agencyId: oid, status: { $ne: TASK_STATUS.DONE }, dueDate: { $ne: null, $lt: now } }).exec(),
    Task.countDocuments({ agencyId: oid, status: { $ne: TASK_STATUS.DONE } }).exec(),
    Task.countDocuments({ agencyId: oid }).exec(),
  ]);

  const [projectRows, taskRows, feedbackRows, upcomingTasks, upcomingMilestones, upcomingProjects, activity] =
    await Promise.all([
      Project.aggregate<{ _id: string; count: number }>([
        { $match: { agencyId: oid } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      Task.aggregate<{ _id: string; count: number }>([
        { $match: { agencyId: oid } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      Feedback.aggregate<{ _id: string; count: number }>([
        { $match: { agencyId: oid } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      Task.find({
        agencyId: oid,
        status: { $ne: TASK_STATUS.DONE },
        dueDate: { $ne: null, $gte: now, $lte: in14Days },
      })
        .populate('project', 'name')
        .populate('assignee', 'name')
        .sort({ dueDate: 1 })
        .limit(8)
        .lean()
        .exec(),
      Milestone.find({
        agencyId: oid,
        status: { $ne: 'COMPLETED' },
        dueDate: { $ne: null, $gte: now, $lte: in14Days },
      })
        .populate('project', 'name')
        .sort({ dueDate: 1 })
        .limit(8)
        .lean()
        .exec(),
      Project.find({
        agencyId: oid,
        status: { $ne: PROJECT_STATUS.COMPLETED },
        expectedCompletionDate: { $ne: null, $gte: now, $lte: in14Days },
      })
        .select('name expectedCompletionDate')
        .sort({ expectedCompletionDate: 1 })
        .limit(8)
        .lean()
        .exec(),
      listAgencyActivity(agencyId, { page: 1, limit: 12 }),
    ]);

  const projectStatusDistribution = Object.fromEntries(
    [PROJECT_STATUS.ACTIVE, PROJECT_STATUS.ON_HOLD, PROJECT_STATUS.COMPLETED].map((s) => [s, 0]),
  ) as Record<string, number>;
  for (const row of projectRows) projectStatusDistribution[row._id] = row.count;

  const taskStatusDistribution = Object.fromEntries(
    [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.REVIEW, TASK_STATUS.DONE].map((s) => [s, 0]),
  ) as Record<string, number>;
  for (const row of taskRows) taskStatusDistribution[row._id] = row.count;

  const feedbackStatusDistribution = Object.fromEntries(
    Object.values(FEEDBACK_STATUS).map((s) => [s, 0]),
  ) as Record<string, number>;
  for (const row of feedbackRows) feedbackStatusDistribution[row._id] = row.count;

  return {
    totalClients, activeProjects, projectsDueSoon, completedProjects, totalProjects, onHoldProjects,
    pendingFeedback, overdueTasks, openTasks, totalTasks,
    upcomingDeadlines: {
      tasks: upcomingTasks.map((raw) => {
        // Cast once: Mongoose's lean() typings do not model populated refs.
        const t = raw as unknown as Record<string, unknown> & { _id: Types.ObjectId; title: string; dueDate?: Date };
        const project = ref<{ name: string }>(t.project);
        const assignee = ref<{ name: string }>(t.assignee);
        return {
          id: String(t._id),
          title: t.title,
          dueDate: t.dueDate as Date,
          projectName: project?.name ?? 'Unknown project',
          assigneeName: assignee?.name,
        };
      }),
      milestones: upcomingMilestones.map((raw) => {
        const m = raw as unknown as Record<string, unknown> & { _id: Types.ObjectId; name: string; dueDate?: Date };
        const project = ref<{ name: string }>(m.project);
        return {
          id: String(m._id),
          name: m.name,
          dueDate: m.dueDate as Date,
          projectName: project?.name ?? 'Unknown project',
        };
      }),
      projects: upcomingProjects.map((p) => ({
        id: String(p._id),
        name: p.name,
        expectedCompletionDate: p.expectedCompletionDate as Date,
      })),
    },
    projectStatusDistribution,
    taskStatusDistribution,
    feedbackStatusDistribution,
    recentActivity: activity.items,
  };
}