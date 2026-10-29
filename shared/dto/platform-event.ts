import { t } from 'elysia';

/** Feed invalidation; clients must refetch persisted, permission-checked items. */
export const ActivityFeedChangedPayloadSchema = t.Object({});
export type ActivityFeedChangedPayload = typeof ActivityFeedChangedPayloadSchema.static;

export const ActivityFeedChangedEventSchema = t.Object({
    id: t.String(),
    occurredAt: t.String(),
    type: t.Literal('activity-feed.changed'),
    data: ActivityFeedChangedPayloadSchema,
});
export type ActivityFeedChangedEvent = typeof ActivityFeedChangedEventSchema.static;

/** Discriminated union of all platform events sent through Centrifugo. */
export const PlatformEventSchema = t.Union([
    ActivityFeedChangedEventSchema,
]);

export type PlatformEvent = typeof PlatformEventSchema.static;