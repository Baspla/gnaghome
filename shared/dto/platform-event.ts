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

export const ReactionChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('reaction.changed'),
});
export type ReactionChangedEvent = typeof ReactionChangedEventSchema.static;

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

export const CrewNowUserStatsChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('crewnow.user-stats.changed'),
});
export type CrewNowUserStatsChangedEvent = typeof CrewNowUserStatsChangedEventSchema.static;

export const UserProfileChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('user.profile.changed'),
});
export type UserProfileChangedEvent = typeof UserProfileChangedEventSchema.static;

export const CallItPredictionChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('callit.prediction.changed'),
});
export type CallItPredictionChangedEvent = typeof CallItPredictionChangedEventSchema.static;

export const CallItUserStatsChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('callit.user-stats.changed'),
});
export type CallItUserStatsChangedEvent = typeof CallItUserStatsChangedEventSchema.static;

export const CallItTrackerChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('callit.tracker.changed'),
});
export type CallItTrackerChangedEvent = typeof CallItTrackerChangedEventSchema.static;

export const CallItSettingsChangedEventSchema = t.Object({
    ...EventBaseSchema,
    type: t.Literal('callit.settings.changed'),
});
export type CallItSettingsChangedEvent = typeof CallItSettingsChangedEventSchema.static;

/** Discriminated union of thin, actionable platform events sent through Centrifugo. */
export const PlatformEventSchema = t.Union([
    ActivityFeedChangedEventSchema,
    DiscussionChangedEventSchema,
    ReactionChangedEventSchema,
    NotificationSettingsChangedEventSchema,
    CustomEmojisChangedEventSchema,
    CrewNowPreferencesChangedEventSchema,
    CrewNowPostChangedEventSchema,
    CrewNowTimelineChangedEventSchema,
    CrewNowUserStatsChangedEventSchema,
    UserProfileChangedEventSchema,
    CallItPredictionChangedEventSchema,
    CallItUserStatsChangedEventSchema,
    CallItTrackerChangedEventSchema,
    CallItSettingsChangedEventSchema,
]);

export type PlatformEvent = typeof PlatformEventSchema.static;

export const PLATFORM_EVENT_TYPES = [
    'activity-feed.changed',
    'discussion.changed',
    'reaction.changed',
    'notification-settings.changed',
    'custom-emojis.changed',
    'crewnow.preferences.changed',
    'crewnow.post.changed',
    'crewnow.timeline.changed',
    'crewnow.user-stats.changed',
    'user.profile.changed',
    'callit.prediction.changed',
    'callit.user-stats.changed',
    'callit.tracker.changed',
    'callit.settings.changed',
] as const satisfies readonly PlatformEvent['type'][];