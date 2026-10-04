import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { VISIBILITY, type Visibility } from '../types/enums';

export type FileEntityType = 'PROJECT' | 'TASK' | 'FEEDBACK' | 'MEETING';

export interface FileAttrs {
  agencyId: Types.ObjectId;
  relatedEntityType: FileEntityType;
  relatedEntityId: Types.ObjectId;
  /** Present for TASK files so listings can filter by project. */
  projectId?: Types.ObjectId | null;
  originalName: string;
  /** Server-generated opaque name; the original name is only used as a download hint. */
  storageKey: string;
  mimeType: string;
  size: number;
  uploadedBy: Types.ObjectId;
  uploadedByName: string;
  visibility: Visibility;
  checksum?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FileDocument = HydratedDocument<FileAttrs>;

const fileSchema = new Schema<FileAttrs>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'agencyId is required'],
      index: true,
    },
    relatedEntityType: {
      type: String,
      enum: ['PROJECT', 'TASK', 'FEEDBACK', 'MEETING'],
      required: [true, 'Related entity type is required'],
      index: true,
    },
    relatedEntityId: {
      type: Schema.Types.ObjectId,
      required: [true, 'Related entity id is required'],
      index: true,
    },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    originalName: { type: String, required: [true, 'Original name is required'], maxlength: 255 },
    storageKey: { type: String, required: [true, 'Storage key is required'], unique: true, index: true },
    mimeType: { type: String, required: [true, 'Mime type is required'], maxlength: 160 },
    size: { type: Number, required: [true, 'File size is required'], min: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uploadedByName: { type: String, required: true, maxlength: 120 },
    visibility: {
      type: String,
      enum: Object.values(VISIBILITY),
      default: VISIBILITY.INTERNAL,
      index: true,
    },
    checksum: { type: String, maxlength: 128 },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

/** Authorisation filter for file listing and download decisions. */
fileSchema.index({ agencyId: 1, relatedEntityType: 1, relatedEntityId: 1 });
fileSchema.index({ agencyId: 1, projectId: 1, visibility: 1 });
fileSchema.index({ agencyId: 1, createdAt: -1 });

export const FileAsset: Model<FileAttrs> = model<FileAttrs>('FileAsset', fileSchema);