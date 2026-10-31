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

/** Content-free global invalidation; clients refetch through authorized discussion APIs. */
export const DiscussionChangedPayloadSchema = t.Object({});
export type DiscussionChangedPayload = typeof DiscussionChangedPayloadSchema.static;

export const DiscussionChangedEventSchema = t.Object({
    id: t.String(),
    occurredAt: t.String(),
    type: t.Literal('discussion.changed'),
    data: DiscussionChangedPayloadSchema,
});
export type DiscussionChangedEvent = typeof DiscussionChangedEventSchema.static;

/** Content-free invalidation for the signed-in user's notification settings. */
export const NotificationSettingsChangedPayloadSchema = t.Object({});
export type NotificationSettingsChangedPayload = typeof NotificationSettingsChangedPayloadSchema.static;

export const NotificationSettingsChangedEventSchema = t.Object({
    id: t.String(),
    occurredAt: t.String(),
    type: t.Literal('notification-settings.changed'),
    data: NotificationSettingsChangedPayloadSchema,
});
export type NotificationSettingsChangedEvent = typeof NotificationSettingsChangedEventSchema.static;

/** Discriminated union of all platform events sent through Centrifugo. */
export const PlatformEventSchema = t.Union([
    ActivityFeedChangedEventSchema,
    DiscussionChangedEventSchema,
    NotificationSettingsChangedEventSchema,
]);

export type PlatformEvent = typeof PlatformEventSchema.static;