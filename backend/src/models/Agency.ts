import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { AGENCY_STATUS, PLANS, type AgencyStatus, type Plan } from '../types/enums';

export interface AgencyAttrs {
  name: string;
  ownerName: string;
  email: string;
  phone?: string;
  status: AgencyStatus;
  plan: Plan;
  address?: string;
  website?: string;
  suspensionReason?: string;
  suspendedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AgencyDocument = HydratedDocument<AgencyAttrs>;

const agencySchema = new Schema<AgencyAttrs>(
  {
    name: { type: String, required: [true, 'Agency name is required'], trim: true, maxlength: 160 },
    ownerName: { type: String, required: [true, 'Owner name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Agency email is required'],
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
    phone: { type: String, trim: true, maxlength: 32 },
    status: {
      type: String,
      enum: Object.values(AGENCY_STATUS),
      default: AGENCY_STATUS.ACTIVE,
      index: true,
    },
    plan: { type: String, enum: Object.values(PLANS), default: PLANS.STARTER, index: true },
    address: { type: String, trim: true, maxlength: 400 },
    website: { type: String, trim: true, maxlength: 200 },
    suspensionReason: { type: String, trim: true, maxlength: 400 },
    suspendedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

agencySchema.index({ name: 'text', email: 'text', ownerName: 'text' });
agencySchema.index({ createdAt: -1 });

export const Agency: Model<AgencyAttrs> = model<AgencyAttrs>('Agency', agencySchema);

export type AgencyId = Types.ObjectId;