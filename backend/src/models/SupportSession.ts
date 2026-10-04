import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { SUPPORT_SCOPE, type SupportScope } from '../types/enums';

/**
 * A support session is the server-side mechanism that lets a SUPER_ADMIN act
 * inside an agency. The browser only ever holds an opaque, single-use
 * `sessionId`; the agency it grants access to is resolved from this document
 * on every request, so a tampered `?agencyId=` has no effect.
 */
export interface SupportSessionAttrs {
  sessionId: string;
  agencyId: Types.ObjectId;
  superAdminId: Types.ObjectId;
  superAdminName: string;
  scope: SupportScope;
  reason: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  endedAt?: Date;
  endedReason?: string;
  /** Count of mutating operations performed under this session. */
  privilegedActionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SupportSessionDocument = HydratedDocument<SupportSessionAttrs>;

const supportSessionSchema = new Schema<SupportSessionAttrs>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    superAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    superAdminName: { type: String, required: true, maxlength: 120 },
    scope: {
      type: String,
      enum: Object.values(SUPPORT_SCOPE),
      default: SUPPORT_SCOPE.READ_ONLY,
    },
    reason: { type: String, required: [true, 'A reason is required to start a support session'], maxlength: 400 },
    ipAddress: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
    expiresAt: { type: Date, required: true },
    endedAt: { type: Date },
    endedReason: { type: String, maxlength: 300 },
    privilegedActionCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

supportSessionSchema.index({ agencyId: 1, createdAt: -1 });
supportSessionSchema.index({ superAdminId: 1, createdAt: -1 });

export const SupportSession: Model<SupportSessionAttrs> = model<SupportSessionAttrs>(
  'SupportSession',
  supportSessionSchema,
);