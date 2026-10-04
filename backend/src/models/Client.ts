import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface ClientAttrs {
  agencyId: Types.ObjectId;
  companyName: string;
  contactPerson: string;
  email: string;
  phone?: string;
  notes?: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClientDocument = HydratedDocument<ClientAttrs>;

const clientSchema = new Schema<ClientAttrs>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'agencyId is required'],
      index: true,
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: 180,
    },
    contactPerson: { type: String, required: [true, 'Contact person is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      trim: true,
      lowercase: true,
      maxlength: 180,
    },
    phone: { type: String, trim: true, maxlength: 32 },
    notes: { type: String, trim: true, maxlength: 2000 },
    address: { type: String, trim: true, maxlength: 400 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

/** Company names only need to be unique inside a tenant. */
clientSchema.index({ agencyId: 1, companyName: 1 }, { unique: true });
clientSchema.index({ agencyId: 1, email: 1 });
clientSchema.index({ agencyId: 1, createdAt: -1 });

export const Client: Model<ClientAttrs> = model<ClientAttrs>('Client', clientSchema);