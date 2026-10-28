import { t } from 'elysia';

/** Payload notifying clients that the durable global counter changed. */
export const CounterChangedPayloadSchema = t.Object({
    totalCount: t.Integer({ minimum: 0 }),
});
export type CounterChangedPayload = typeof CounterChangedPayloadSchema.static;

/** Counter event envelope; durable state remains in the backend database. */
export const CounterChangedEventSchema = t.Object({
    id: t.String(),
    occurredAt: t.String(),
    type: t.Literal('counter.changed'),
    data: CounterChangedPayloadSchema,
});
export type CounterChangedEvent = typeof CounterChangedEventSchema.static;

/** Discriminated union of all platform events sent through Centrifugo. */
export const PlatformEventSchema = t.Union([
    CounterChangedEventSchema,
]);

export type PlatformEvent = typeof PlatformEventSchema.static;