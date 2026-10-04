import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { PRIORITIES, PROJECT_STATUS, type Priority, type ProjectStatus } from '../types/enums';

export interface ProjectAttrs {
  agencyId: Types.ObjectId;
  clientId: Types.ObjectId;
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: Priority;
  startDate: Date;
  expectedCompletionDate?: Date;
  /** Must reference an active member of the same agency. */
  projectManagerId: Types.ObjectId | null;
  budget?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDocument = HydratedDocument<ProjectAttrs>;

const projectSchema = new Schema<ProjectAttrs>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'agencyId is required'],
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client is required'],
      index: true,
    },
    name: { type: String, required: [true, 'Project name is required'], trim: true, maxlength: 180 },
    description: { type: String, trim: true, maxlength: 4000 },
    status: {
      type: String,
      enum: Object.values(PROJECT_STATUS),
      default: PROJECT_STATUS.ACTIVE,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(PRIORITIES),
      default: PRIORITIES.MEDIUM,
      index: true,
    },
    startDate: { type: Date, required: [true, 'Start date is required'] },
    expectedCompletionDate: { type: Date },
    projectManagerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    budget: { type: Number, min: 0, max: 1_000_000_000 },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

/**
 * Populate targets.
 *
 * Mongoose 7+ enables `strictPopulate`, which rejects `.populate('client')`
 * unless the path is declared. Declaring them as read-only virtuals keeps the
 * stored document free of duplicated data while making population explicit.
 */
projectSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true,
});

projectSchema.virtual('projectManager', {
  ref: 'User',
  localField: 'projectManagerId',
  foreignField: '_id',
  justOne: true,
});

projectSchema.index({ agencyId: 1, status: 1, updatedAt: -1 });
projectSchema.index({ agencyId: 1, clientId: 1 });
projectSchema.index({ agencyId: 1, expectedCompletionDate: 1 });

projectSchema.pre('validate', function validateDates(next) {
  const start = this.get('startDate') as Date | undefined;
  const end = this.get('expectedCompletionDate') as Date | undefined;
  if (start && end && end.getTime() < start.getTime()) {
    return next(new Error('Expected completion date must be on or after the start date'));
  }
  next();
});

export const Project: Model<ProjectAttrs> = model<ProjectAttrs>('Project', projectSchema);