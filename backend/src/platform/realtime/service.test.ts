import { describe, expect, it, mock } from 'bun:test';
import { createBroadcastPublisher, createCentrifugoPublisher, generateCentrifugoToken } from './service';
import * as jose from 'jose';
import { env } from '../../env';
import type { PlatformEvent } from '$shared/dto/platform-event';

const event: PlatformEvent = {
    id: 'event-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    type: 'counter.changed',
    data: { totalCount: 1 },
};

describe('Centrifugo publisher', () => {
    it('includes shared application realtime channels in authenticated tokens', async () => {
        const user = {
            id: 'user-1',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            name: 'Test User',
            email: 'user@example.test',
            emailVerified: true,
            image: null,
        };
        const result = await generateCentrifugoToken(user, 'device-1');
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const payload = await jose.jwtVerify(result.value, new TextEncoder().encode(env.CENTRIFUGO_SECRET));
        expect(payload.payload.channels).toContain('public:counter');
        expect(payload.payload.channels).toContain('public:activity-feed');
        expect(payload.payload.channels).toContain('public:activity-feed');
        expect(payload.payload.channels).toContain('user:user-1');
    });

    it('sends broadcast payloads with the configured API key', async () => {
        const fetcher = mock(async () => new Response('{}', { status: 200 }));
        const publish = createCentrifugoPublisher('http://centrifugo.test', 'test-api-key', fetcher);

        const broadcast = createBroadcastPublisher(publish);
        const result = await broadcast(['user:one', 'user:two'], event);

        expect(result).toEqual({ ok: true, value: null });
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        const requestBody = JSON.parse(String(init.body));
        expect(url).toBe('http://centrifugo.test/api/broadcast');
        expect(new Headers(init.headers).get('X-API-Key')).toBe('test-api-key');
        expect(requestBody).toEqual({ channels: ['user:one', 'user:two'], data: event });
        expect(requestBody.data.type).toBe('counter.changed');
        expect(requestBody.data.data.totalCount).toBe(1);
    });

    it('returns a domain error for a non-success response', async () => {
        const publish = async () => new Response('unavailable', { status: 503, statusText: 'Unavailable' });
        const result = await createBroadcastPublisher(publish)(['user:one'], event);

        expect(result).toEqual({
            ok: false,
            error: {
                status: 500,
                code: 'INTERNAL_ERROR',
                message: 'Centrifugo broadcast failed: 503 Unavailable',
            },
        });
    });

    it('returns a domain error when publishing throws', async () => {
        const publish = async () => { throw new Error('connection refused'); };
        const result = await createBroadcastPublisher(publish)(['user:one'], event);

        expect(result).toEqual({
            ok: false,
            error: { status: 500, code: 'INTERNAL_ERROR', message: 'Failed to reach Centrifugo for broadcast' },
        });
    });
});