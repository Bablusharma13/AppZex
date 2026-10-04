import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { FEEDBACK_STATUS, type FeedbackStatus } from '../types/enums';

export interface FeedbackReply {
  authorId: Types.ObjectId;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: Date;
}

export interface FeedbackAttrs {
  agencyId: Types.ObjectId;
  projectId: Types.ObjectId;
  clientId: Types.ObjectId;
  submittedBy: Types.ObjectId;
  submittedByName: string;
  title: string;
  description: string;
  category: string;
  status: FeedbackStatus;
  agencyResponse?: string;
  respondedBy?: Types.ObjectId;
  respondedAt?: Date;
  replies: FeedbackReply[];
  createdAt: Date;
  updatedAt: Date;
}

export type FeedbackDocument = HydratedDocument<FeedbackAttrs>;

const replySchema = new Schema<FeedbackReply>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true, maxlength: 120 },
    authorRole: { type: String, required: true, maxlength: 40 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

const feedbackSchema = new Schema<FeedbackAttrs>(
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
    /** Denormalised from the submitting user so client ownership can be enforced in one filter. */
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client is required'],
      index: true,
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    submittedByName: { type: String, required: true, maxlength: 120 },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
    description: { type: String, required: [true, 'Description is required'], trim: true, maxlength: 8000 },
    category: { type: String, default: 'GENERAL', maxlength: 40, index: true },
    status: {
      type: String,
      enum: Object.values(FEEDBACK_STATUS),
      default: FEEDBACK_STATUS.OPEN,
      index: true,
    },
    agencyResponse: { type: String, trim: true, maxlength: 8000 },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    replies: { type: [replySchema], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

// Declared so `.populate(...)` is permitted under Mongoose's strictPopulate.
feedbackSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

feedbackSchema.virtual('client', {
  ref: 'Client',
  localField: 'clientId',
  foreignField: '_id',
  justOne: true,
});

feedbackSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
feedbackSchema.index({ agencyId: 1, projectId: 1, status: 1 });
/** Primary client-facing filter: one client's own requests. */
feedbackSchema.index({ clientId: 1, createdAt: -1 });

export const Feedback: Model<FeedbackAttrs> = model<FeedbackAttrs>('Feedback', feedbackSchema);