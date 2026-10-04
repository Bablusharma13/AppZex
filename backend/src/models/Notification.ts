import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface NotificationAttrs {
  agencyId: Types.ObjectId;
  /** `null` means the notification targets every member of the agency. */
  recipientId: Types.ObjectId | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<NotificationAttrs>;

const notificationSchema = new Schema<NotificationAttrs>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    type: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 1000 },
    link: { type: String, maxlength: 400 },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ agencyId: 1, createdAt: -1 });

export const Notification: Model<NotificationAttrs> = model<NotificationAttrs>(
  'Notification',
  notificationSchema,
);