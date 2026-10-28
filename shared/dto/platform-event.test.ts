import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { PlatformEventSchema, type CounterChangedEvent, type PlatformEvent } from './platform-event';
import { isPlatformEvent } from './platform-event-validation';

const app = new Elysia()
    .post('/event', ({ body }) => body, { body: PlatformEventSchema });

describe('PlatformEventSchema', () => {
    it('accepts the counter changed event with its typed payload', async () => {
        const response = await app.handle(new Request('http://localhost/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: 'event-1',
                occurredAt: '2026-10-28T12:00:00.000Z',
                type: 'counter.changed',
                data: { totalCount: 12 },
            }),
        }));

        expect(response.status).toBe(200);
    });

    it('rejects unknown event types and malformed counter payloads', async () => {
        for (const invalidEvent of [
            {
                id: 'event-2',
                occurredAt: '2026-10-28T12:00:00.000Z',
                type: 'made.up.event',
                data: {},
            },
            {
                id: 'event-3',
                occurredAt: '2026-10-28T12:00:00.000Z',
                type: 'counter.changed',
                data: { totalCount: 'twelve' },
            },
        ]) {
            const response = await app.handle(new Request('http://localhost/event', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(invalidEvent),
            }));

            expect(response.status).toBe(422);
        }
    });

    it('provides a discriminated event type and typed payload', () => {
        const validEvent: PlatformEvent = {
            id: 'event-4',
            occurredAt: '2026-10-28T12:00:00.000Z',
            type: 'counter.changed',
            data: { totalCount: 12 },
        };
        expect(isPlatformEvent(validEvent)).toBe(true);
        expect(isPlatformEvent({ ...validEvent, data: { totalCount: '12' } })).toBe(false);
        expect(isPlatformEvent({ ...validEvent, type: 'unknown.event' })).toBe(false);

        const event: CounterChangedEvent = validEvent;
        expect(event.data.totalCount).toBe(12);
    });
});