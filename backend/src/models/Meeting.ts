import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { VISIBILITY, type Visibility } from '../types/enums';

export interface AiSummary {
  summary: string;
  decisions: string[];
  actionItems: { title: string; owner?: string; dueDate?: string }[];
  deadlines: string[];
  generatedAt: Date;
  model: string;
}

export interface MeetingAttrs {
  agencyId: Types.ObjectId;
  projectId: Types.ObjectId;
  title: string;
  date: Date;
  durationMinutes?: number;
  /** Raw, human-entered notes. This is the AI input. */
  notes?: string;
  agenda?: string;
  /** Internal-only notes are never exposed to client accounts. */
  internalNotes?: string;
  visibility: Visibility;
  attendees: string[];
  aiSummary: AiSummary | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type MeetingDocument = HydratedDocument<MeetingAttrs>;

const aiSummarySchema = new Schema<AiSummary>(
  {
    summary: { type: String, required: true, maxlength: 8000 },
    decisions: { type: [String], default: [] },
    actionItems: {
      type: [
        new Schema(
          {
            title: { type: String, required: true, maxlength: 300 },
            owner: { type: String, maxlength: 120 },
            dueDate: { type: String, maxlength: 60 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    deadlines: { type: [String], default: [] },
    generatedAt: { type: Date, default: () => new Date() },
    model: { type: String, required: true, maxlength: 80 },
  },
  { _id: false },
);

const meetingSchema = new Schema<MeetingAttrs>(
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
    title: { type: String, required: [true, 'Meeting title is required'], trim: true, maxlength: 200 },
    date: { type: Date, required: [true, 'Meeting date is required'], index: true },
    durationMinutes: { type: Number, min: 5, max: 600 },
    notes: { type: String, trim: true, maxlength: 20000 },
    agenda: { type: String, trim: true, maxlength: 4000 },
    internalNotes: { type: String, trim: true, maxlength: 10000, select: false },
    visibility: {
      type: String,
      enum: Object.values(VISIBILITY),
      default: VISIBILITY.INTERNAL,
      index: true,
    },
    attendees: { type: [String], default: [] },
    aiSummary: { type: aiSummarySchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

// Declared so `.populate(...)` is permitted under Mongoose's strictPopulate.
meetingSchema.virtual('project', {
  ref: 'Project',
  localField: 'projectId',
  foreignField: '_id',
  justOne: true,
});

meetingSchema.index({ agencyId: 1, projectId: 1, date: -1 });
meetingSchema.index({ agencyId: 1, visibility: 1, date: -1 });

export const Meeting: Model<MeetingAttrs> = model<MeetingAttrs>('Meeting', meetingSchema);