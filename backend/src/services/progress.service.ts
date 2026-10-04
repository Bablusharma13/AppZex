import { Types } from 'mongoose';
import { Task } from '../models/Task';
import { TASK_STATUS } from '../types/enums';

export interface ProgressStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  reviewTasks: number;
  /** Integer percentage derived from task completion - never stored on the document. */
  progressPercentage: number;
  overdueTasks: number;
}

export const EMPTY_PROGRESS: ProgressStats = {
  totalTasks: 0,
  completedTasks: 0,
  inProgressTasks: 0,
  todoTasks: 0,
  reviewTasks: 0,
  progressPercentage: 0,
  overdueTasks: 0,
};

/**
 * Computes project progress from the task collection.
 *
 * Progress is intentionally *never* accepted from a client payload and never
 * stored on the project document: this aggregation over tasks is the single
 * source of truth, so the displayed percentage can never drift from reality.
 *
 * Example: 10 tasks, 4 with status DONE => 40%.
 */
export async function computeProgress(
  agencyId: string,
  projectIds: Types.ObjectId[],
): Promise<Map<string, ProgressStats>> {
  const result = new Map<string, ProgressStats>();
  if (projectIds.length === 0) return result;

  const now = new Date();

  const rows = await Task.aggregate<{
    _id: Types.ObjectId;
    total: number;
    completed: number;
    inProgress: number;
    todo: number;
    review: number;
    overdue: number;
  }>([
    { $match: { agencyId: new Types.ObjectId(agencyId), projectId: { $in: projectIds } } },
    {
      $group: {
        _id: '$projectId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.IN_PROGRESS] }, 1, 0] } },
        todo: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.TODO] }, 1, 0] } },
        review: { $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.REVIEW] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', TASK_STATUS.DONE] },
                  { $ne: [{ $ifNull: ['$dueDate', null] }, null] },
                  { $lt: ['$dueDate', now] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).exec();

  for (const row of rows) {
    result.set(String(row._id), {
      totalTasks: row.total,
      completedTasks: row.completed,
      inProgressTasks: row.inProgress,
      todoTasks: row.todo,
      reviewTasks: row.review,
      overdueTasks: row.overdue,
      progressPercentage: row.total === 0 ? 0 : Math.round((row.completed / row.total) * 100),
    });
  }

  return result;
}

/** Convenience wrapper for a single project. */
export async function computeProjectProgress(agencyId: string, projectId: string): Promise<ProgressStats> {
  const map = await computeProgress(agencyId, [new Types.ObjectId(projectId)]);
  return map.get(projectId) ?? EMPTY_PROGRESS;
}