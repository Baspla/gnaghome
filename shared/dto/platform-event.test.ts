import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { PlatformEventSchema, type ActivityFeedChangedEvent, type PlatformEvent } from './platform-event';
import { isPlatformEvent } from './platform-event-validation';

const app = new Elysia()
    .post('/event', ({ body }) => body, { body: PlatformEventSchema });

describe('PlatformEventSchema', () => {
    it('rejects unknown events, malformed feed events, and events for the removed counter feature', () => {
        expect(isPlatformEvent({
            id: 'event-2',
            occurredAt: '2026-10-28T12:00:00.000Z',
            type: 'made.up.event',
            data: {},
        })).toBe(false);
        expect(isPlatformEvent({
            id: 'event-3',
            occurredAt: '2026-10-28T12:00:00.000Z',
            type: 'counter.changed',
            data: { totalCount: 12 },
        })).toBe(false);
        expect(isPlatformEvent({
            id: 'event-4',
            occurredAt: '2026-10-28T12:00:00.000Z',
            type: 'activity-feed.changed',
            data: { extra: true },
        })).toBe(false);
    });

    it('accepts an activity-feed invalidation event without carrying activity data', async () => {
        const event: PlatformEvent = {
            id: 'event-feed-1',
            occurredAt: '2026-10-28T12:00:00.000Z',
            type: 'activity-feed.changed',
            data: {},
        };
        const feedEvent: ActivityFeedChangedEvent = {
            id: 'event-feed-1',
            occurredAt: '2026-10-28T12:00:00.000Z',
            type: 'activity-feed.changed',
            data: {},
        };

        expect(isPlatformEvent(feedEvent)).toBe(true);
        expect(isPlatformEvent({ ...feedEvent, data: { title: 'private post' } })).toBe(false);
        expect(isPlatformEvent({ ...feedEvent, type: 'activity-feed.deleted' })).toBe(false);

        const response = await app.handle(new Request('http://localhost/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(feedEvent),
        }));
        expect(response.status).toBe(200);
    });
});