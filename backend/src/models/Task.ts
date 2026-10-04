import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { PRIORITIES, TASK_STATUS, type Priority, type TaskStatus } from '../types/enums';

export interface TaskComment {
  authorId: Types.ObjectId;
  authorName: string;
  body: string;
  createdAt: Date;
}

export interface TaskAttrs {
  agencyId: Types.ObjectId;
  projectId: Types.ObjectId;
  milestoneId: Types.ObjectId | null;
  title: string;
  description?: string;
  /** Must reference an active member of the same agency. */
  assigneeId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  status: TaskStatus;
  priority: Priority;
  dueDate?: Date;
  completedAt?: Date;
  comments: TaskComment[];
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<TaskAttrs>;

const commentSchema = new Schema<TaskComment>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const taskSchema = new Schema<TaskAttrs>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'agencyId is required'],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project is required'],
      index: true,
    },
    milestoneId: { type: Schema.Types.ObjectId, ref: 'Milestone', default: null, index: true },
    title: { type: String, required: [true, 'Task title is required'], trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 4000 },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.TODO,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(PRIORITIES),
      default: PRIORITIES.MEDIUM,
      index: true,
    },
    dueDate: { type: Date, index: true },
    completedAt: { type: Date },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

// Declared so `.populate(...)` is permitted under Mongoose's strictPopulate.
taskSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

taskSchema.virtual('milestone', {
  ref: 'Milestone',
  localField: 'milestoneId',
  foreignField: '_id',
  justOne: true,
});

taskSchema.virtual('assignee', {
  ref: 'User',
  localField: 'assigneeId',
  foreignField: '_id',
  justOne: true,
});

taskSchema.index({ agencyId: 1, projectId: 1, status: 1 });
taskSchema.index({ agencyId: 1, assigneeId: 1, status: 1 });
taskSchema.index({ agencyId: 1, dueDate: 1 });

/**
 * Cross-entity integrity (milestone must belong to the project) is validated in
 * `task.service.ts`, where both documents can be loaded with tenant scoping
 * applied. Keeping it out of the model avoids circular imports and guarantees
 * the check runs against tenant-filtered queries.
 */
taskSchema.pre('save', function stampCompletion(next) {
  const status = this.get('status') as TaskStatus;
  if (status === TASK_STATUS.DONE && !this.get('completedAt')) this.set('completedAt', new Date());
  if (status !== TASK_STATUS.DONE) this.set('completedAt', undefined);
  next();
});

export const Task: Model<TaskAttrs> = model<TaskAttrs>('Task', taskSchema);