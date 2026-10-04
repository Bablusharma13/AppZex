import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { MILESTONE_STATUS, type MilestoneStatus } from '../types/enums';

export interface MilestoneAttrs {
  agencyId: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  description?: string;
  status: MilestoneStatus;
  dueDate?: Date;
  order: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type MilestoneDocument = HydratedDocument<MilestoneAttrs>;

const milestoneSchema = new Schema<MilestoneAttrs>(
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
    name: { type: String, required: [true, 'Milestone name is required'], trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: Object.values(MILESTONE_STATUS),
      default: MILESTONE_STATUS.PENDING,
      index: true,
    },
    dueDate: { type: Date },
    order: { type: Number, required: true, min: 0, default: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

// Declared so `.populate('project')` is permitted under Mongoose's strictPopulate.
milestoneSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

milestoneSchema.index({ agencyId: 1, projectId: 1, order: 1 });
milestoneSchema.index({ agencyId: 1, status: 1 });

export const Milestone: Model<MilestoneAttrs> = model<MilestoneAttrs>('Milestone', milestoneSchema);