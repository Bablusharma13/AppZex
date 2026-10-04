import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { ROLES, type Role } from '../types/enums';

export interface AgencyMemberAttrs {
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  role: Role;
  jobTitle?: string;
  joinedAt: Date;
  invitedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AgencyMemberDocument = HydratedDocument<AgencyMemberAttrs>;

const agencyMemberSchema = new Schema<AgencyMemberAttrs>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'agencyId is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    role: {
      type: String,
      enum: [ROLES.AGENCY_ADMIN, ROLES.AGENCY_TEAM],
      required: true,
    },
    jobTitle: { type: String, trim: true, maxlength: 120 },
    joinedAt: { type: Date, default: () => new Date() },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

/** A user holds at most one membership per agency. */
agencyMemberSchema.index({ agencyId: 1, userId: 1 }, { unique: true });
agencyMemberSchema.index({ agencyId: 1, role: 1 });

export const AgencyMember: Model<AgencyMemberAttrs> = model<AgencyMemberAttrs>(
  'AgencyMember',
  agencyMemberSchema,
);