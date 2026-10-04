import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { ACTOR_TYPES, ENTITY_TYPES, VISIBILITY, type ActorType, type EntityType, type Visibility } from '../types/enums';

export interface ActivityLogAttrs {
  agencyId: Types.ObjectId;
  actorId: Types.ObjectId | null;
  actorName: string;
  actorType: ActorType;
  eventType: string;
  relatedEntityType?: EntityType;
  relatedEntityId?: Types.ObjectId;
  visibility: Visibility;
  /** Free-form context (status changes, support session ids, request metadata). */
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityLogDocument = HydratedDocument<ActivityLogAttrs>;

const activityLogSchema = new Schema<ActivityLogAttrs>(
  {
    agencyId: {
      type: Schema.Types.ObjectId,
      ref: 'Agency',
      required: [true, 'agencyId is required'],
      index: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, required: [true, 'Actor name is required'], maxlength: 120 },
    actorType: {
      type: String,
      enum: Object.values(ACTOR_TYPES),
      default: ACTOR_TYPES.USER,
    },
    eventType: { type: String, required: [true, 'Event type is required'], index: true },
    relatedEntityType: { type: String, enum: Object.values(ENTITY_TYPES) },
    relatedEntityId: { type: Schema.Types.ObjectId },
    visibility: {
      type: String,
      enum: Object.values(VISIBILITY),
      default: VISIBILITY.INTERNAL,
      index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

/** Primary read patterns: per-tenant timeline and per-entity history. */
activityLogSchema.index({ agencyId: 1, createdAt: -1 });
activityLogSchema.index({ agencyId: 1, eventType: 1, createdAt: -1 });
activityLogSchema.index({ relatedEntityType: 1, relatedEntityId: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

export const ActivityLog: Model<ActivityLogAttrs> = model<ActivityLogAttrs>('ActivityLog', activityLogSchema);