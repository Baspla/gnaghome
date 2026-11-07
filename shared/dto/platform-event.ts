import { t } from 'elysia';

const EventBaseSchema = {
    id: t.String({ minLength: 1 }),
    occurredAt: t.String({ format: 'date-time' }),
    action: t.Union([t.Literal('CREATED'), t.Literal('UPDATED'), t.Literal('DELETED')]),
    entityId: t.String({ minLength: 1 }),
    data: t.Optional(t.Never()),
};

export const PlatformEventActionSchema = t.Union([
    t.Literal('CREATED'),
    t.Literal('UPDATED'),
    t.Literal('DELETED'),
]);
export type PlatformEventAction = typeof PlatformEventActionSchema.static;

export const ActivityFeedChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('activity-feed.changed'),
});
export type ActivityFeedChangedEvent = typeof ActivityFeedChangedEventSchema.static;

export const DiscussionChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('discussion.changed'),
});
export type DiscussionChangedEvent = typeof DiscussionChangedEventSchema.static;

export const NotificationSettingsChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('notification-settings.changed'),
});
export type NotificationSettingsChangedEvent = typeof NotificationSettingsChangedEventSchema.static;

export const CustomEmojisChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('custom-emojis.changed'),
});
export type CustomEmojisChangedEvent = typeof CustomEmojisChangedEventSchema.static;

export const CrewNowPreferencesChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('crewnow.preferences.changed'),
});
export type CrewNowPreferencesChangedEvent = typeof CrewNowPreferencesChangedEventSchema.static;

export const CrewNowPostChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('crewnow.post.changed'),
});
export type CrewNowPostChangedEvent = typeof CrewNowPostChangedEventSchema.static;

export const CrewNowTimelineChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('crewnow.timeline.changed'),
});
export type CrewNowTimelineChangedEvent = typeof CrewNowTimelineChangedEventSchema.static;

/** Discriminated union of thin, actionable platform events sent through Centrifugo. */
export const PlatformEventSchema = t.Union([
    ActivityFeedChangedEventSchema,
    DiscussionChangedEventSchema,
    NotificationSettingsChangedEventSchema,
    CustomEmojisChangedEventSchema,
    CrewNowPreferencesChangedEventSchema,
    CrewNowPostChangedEventSchema,
    CrewNowTimelineChangedEventSchema,
]);

export type PlatformEvent = typeof PlatformEventSchema.static;

export const PLATFORM_EVENT_TYPES = [
    'activity-feed.changed',
    'discussion.changed',
    'notification-settings.changed',
    'custom-emojis.changed',
    'crewnow.preferences.changed',
    'crewnow.post.changed',
    'crewnow.timeline.changed',
] as const satisfies readonly PlatformEvent['type'][];