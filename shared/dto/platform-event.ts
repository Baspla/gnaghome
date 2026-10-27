import { t } from 'elysia';

/** Generic Centrifugo event envelope; durable state remains in the backend database. */
export const PlatformEventSchema = t.Object({
    id: t.String(),
    occurredAt: t.String(),
    type: t.String(),
    data: t.Unknown(),
});

export type PlatformEvent = typeof PlatformEventSchema.static;