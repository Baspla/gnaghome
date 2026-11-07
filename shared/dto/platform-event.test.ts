import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { PlatformEventSchema, type PlatformEvent } from './platform-event';
import { isPlatformEvent } from './platform-event-validation';

const app = new Elysia().post('/event', ({ body }) => body, { body: PlatformEventSchema });

describe('PlatformEventSchema', () => {
    const validEvent: PlatformEvent = {
        id: 'event-1',
        occurredAt: '2026-11-07T12:34:56.000Z',
        type: 'discussion.changed',
        action: 'CREATED',
        entityId: 'discussion-1',
    };

    it('accepts events with routing context and no data payload', async () => {
        expect(isPlatformEvent(validEvent)).toBe(true);

        const response = await app.handle(new Request('http://localhost/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(validEvent),
        }));
        expect(response.status).toBe(200);
    });

    it('rejects unknown event types, actions, and missing or empty routing fields', () => {
        expect(isPlatformEvent({ ...validEvent, type: 'unknown.changed' })).toBe(false);
        expect(isPlatformEvent({ ...validEvent, action: 'UPSERT' })).toBe(false);
        expect(isPlatformEvent({ ...validEvent, id: '' })).toBe(false);
        expect(isPlatformEvent({ ...validEvent, entityId: '' })).toBe(false);
        expect(isPlatformEvent({ ...validEvent, occurredAt: 'not-a-timestamp' })).toBe(false);
        const { action: _action, ...withoutAction } = validEvent;
        expect(isPlatformEvent(withoutAction)).toBe(false);
        const { occurredAt: _occurredAt, ...withoutOccurredAt } = validEvent;
        expect(isPlatformEvent(withoutOccurredAt)).toBe(false);
    });

    it('rejects all data fields including an empty object', () => {
        expect(isPlatformEvent({ ...validEvent, data: {} })).toBe(false);
        expect(isPlatformEvent({ ...validEvent, data: { title: 'private content' } })).toBe(false);
    });

    it('accepts each supported event type and all three actions', () => {
        const types = [
            'activity-feed.changed',
            'discussion.changed',
            'reaction.changed',
            'notification-settings.changed',
            'custom-emojis.changed',
            'crewnow.preferences.changed',
            'crewnow.post.changed',
            'crewnow.timeline.changed',
        ] as const;
        const actions = ['CREATED', 'UPDATED', 'DELETED'] as const;

        for (const type of types) {
            for (const action of actions) {
                expect(isPlatformEvent({ ...validEvent, type, action })).toBe(true);
            }
        }
    });
});