import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { ROLES, type Role } from '../types/enums';

export interface UserAttrs {
  name: string;
  email: string;
  /** Never selected by default; must be requested explicitly with `.select('+passwordHash')`. */
  passwordHash: string;
  role: Role;
  agencyId: Types.ObjectId | null;
  /** Set only for CLIENT users: the client company record they belong to. */
  clientId: Types.ObjectId | null;
  isActive: boolean;
  avatarUrl?: string;
  jobTitle?: string;
  phone?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserAttrs>;

const userSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 180,
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: [true, 'Role is required'],
      index: true,
    },
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      default: null,
      index: true,
    },
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    avatarUrl: { type: String, trim: true },
    jobTitle: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 32 },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  },
);

/** Tenant-scoped lookups always filter by (agencyId, ...) and never by email alone. */
userSchema.index({ agencyId: 1, role: 1 });
userSchema.index({ agencyId: 1, isActive: 1 });

/**
 * Invariants enforced at the persistence layer so that a malformed request can
 * never create an orphaned principal.
 */
userSchema.pre('validate', function enforceTenantConsistency(next) {
  const role = this.get('role') as Role;

  if (role === ROLES.SUPER_ADMIN) {
    if (this.get('agencyId') || this.get('clientId')) {
      return next(new Error('Super admin accounts cannot belong to an agency or client'));
    }
  }

  if (role === ROLES.CLIENT) {
    if (!this.get('agencyId')) return next(new Error('Client users must belong to an agency'));
    if (!this.get('clientId')) return next(new Error('Client users must be linked to a client company'));
  }

  if (role === ROLES.AGENCY_ADMIN || role === ROLES.AGENCY_TEAM) {
    if (!this.get('agencyId')) return next(new Error('Agency users must belong to an agency'));
    if (this.get('clientId')) return next(new Error('Agency staff cannot be linked to a client company'));
  }

  next();
});

/** Strip the hash defensively even if a caller explicitly selects it. */
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const safe = ret as unknown as Record<string, unknown>;
    delete safe.passwordHash;
    delete safe.__v;
    return ret;
  },
});

export const User: Model<UserAttrs> = model<UserAttrs>('User', userSchema);