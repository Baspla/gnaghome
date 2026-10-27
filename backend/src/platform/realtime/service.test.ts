import { describe, expect, it, mock } from 'bun:test';
import { createBroadcastPublisher, createCentrifugoPublisher } from './service';

const event = {
    id: 'event-1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    type: 'activity.created',
    data: { activityId: 'activity-1' },
};

describe('Centrifugo publisher', () => {
    it('sends broadcast payloads with the configured API key', async () => {
        const fetcher = mock(async () => new Response('{}', { status: 200 }));
        const publish = createCentrifugoPublisher('http://centrifugo.test', 'test-api-key', fetcher);

        const broadcast = createBroadcastPublisher(publish);
        const result = await broadcast(['user:one', 'user:two'], event);

        expect(result).toEqual({ ok: true, value: null });
        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('http://centrifugo.test/api/broadcast');
        expect(new Headers(init.headers).get('X-API-Key')).toBe('test-api-key');
        expect(JSON.parse(String(init.body))).toEqual({
            channels: ['user:one', 'user:two'],
            data: JSON.parse(JSON.stringify(event)),
        });
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