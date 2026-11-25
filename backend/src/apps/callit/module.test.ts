import { beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { createAuthMiddleware } from '../../platform/auth';
import { ok } from '../../lib/result';
import { createCallItModule } from './module';
import type { CallItPredictionSummary, CallItService, CallItTrackerSummary } from './service';

describe('Call It HTTP module', () => {
    let authenticated = true;
    let admin = false;
    let rescheduled: number[] = [];
    let createdPrediction: unknown;
    let trackerDetailHistoryDays: number | undefined;
    let service: CallItService;

    const tracker: CallItTrackerSummary = {
        id: 'tracker-1',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        isActive: true,
        lastPrice: 100,
        lastPriceAt: new Date('2026-01-01T12:00:00.000Z'),
        discussionId: 'discussion-1',
    };

    const prediction: CallItPredictionSummary = {
        id: 'prediction-1',
        user: { id: 'viewer', name: 'Viewer', image: null },
        tracker,
        direction: 'UP',
        durationKey: '1d',
        wager: 100,
        startPrice: 100,
        startAt: new Date('2026-01-01T12:00:00.000Z'),
        endsAt: new Date('2026-01-02T12:00:00.000Z'),
        status: 'ACTIVE',
        endPrice: null,
        resolvedAt: null,
        profitLoss: null,
        priceChangePercent: null,
        currentPrice: 100,
        currentPriceAt: new Date('2026-01-01T12:00:00.000Z'),
        unrealizedProfitLoss: 0,
        reactionCount: 0,
        reactionEmoji: null,
    };

    function app() {
        const auth = createAuthMiddleware(
            async () => authenticated ? {
                user: {
                    id: 'viewer', createdAt: new Date(), updatedAt: new Date(), name: 'Viewer',
                    email: 'viewer@example.test', emailVerified: true,
                    groups: admin ? '["admins"]' : '[]', image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
            'admins',
        );
        return new Elysia().use(createCallItModule(auth, service, {
            getPreferences: async () => ok({ chartType: 'line' }),
            updatePreferences: async (_userId, preferences) => ok({ chartType: preferences.chartType }),
        }, async (minutes) => {
            rescheduled.push(minutes);
        }));
    }


    beforeEach(() => {
        authenticated = true;
        admin = false;
        rescheduled = [];
        createdPrediction = undefined;
        trackerDetailHistoryDays = undefined;
        service = {
            getOverview: async () => ok({
                myStats: {
                    activePredictionCount: 1,
                    activeWagerTotal: 100,
                    allTimeWagerTotal: 0,
                    allTimeProfit: 0,
                    unrealizedProfit: 0,
                    returnPercent: null,
                    completedCount: 0,
                    wins: 0,
                    losses: 0,
                },
                limits: { maxActivePredictionsPerUser: 6 },
                myActivePredictions: [prediction],
                otherActivePredictions: [],
                leaderboard: [],
            }),
            getUserPage: async () => ok({
                user: { id: 'viewer', name: 'Viewer', image: null },
                stats: {
                    activePredictionCount: 0,
                    activeWagerTotal: 0,
                    allTimeWagerTotal: 0,
                    allTimeProfit: 0,
                    unrealizedProfit: 0,
                    returnPercent: null,
                    completedCount: 0,
                    wins: 0,
                    losses: 0,
                },
                limits: { maxActivePredictionsPerUser: 6 },
                activePredictions: [],
                completedPredictions: [],
            }),
            listActiveTrackers: async () => ok([{ ...tracker, activePredictionCount: 1 }]),
            listActiveTrackersWithHistory: async () => ok([{
                ...tracker,
                activePredictionCount: 1,
                history: [{ observedAt: new Date('2026-01-01T12:00:00.000Z'), open: 99, high: 101, low: 98, close: 100 }],
            }]),
            getTrackerDetail: async (_viewerUserId: string, _trackerId: string, options?: { historyDays?: number }) => {
                trackerDetailHistoryDays = options?.historyDays;
                return ok({
                    tracker,
                    commentCount: 0,
                    history: [{ observedAt: new Date('2026-01-01T12:00:00.000Z'), open: 99, high: 101, low: 98, close: 100 }],
                    activePredictions: [prediction],
                    completedPredictions: [],
                });
            },
            createPrediction: async (_userId: string, input: Parameters<CallItService['createPrediction']>[1]) => {
                createdPrediction = input;
                return ok({ ...prediction, created: true });
            },
            listAllTrackersForAdmin: async () => ok([{ ...tracker, activePredictionCount: 1 }]),
            previewTracker: async () => ok({
                symbol: 'AAPL',
                name: 'Apple Inc.',
                currency: 'USD',
                price: 100,
                marketTime: new Date('2026-01-01T12:00:00.000Z'),
                marketState: 'REGULAR',
                history: [{ observedAt: new Date('2026-01-01T12:00:00.000Z'), open: 99, high: 101, low: 98, close: 100 }],
                existingTracker: null,
            }),
            addTracker: async () => ok({ tracker: { ...tracker, activePredictionCount: 0 }, created: true }),
            removeTracker: async () => ok(null),
            fullyRemoveTracker: async () => ok(null),
            getSettings: async () => ok({
                updateIntervalMinutes: 15,
                maxActivePredictionsPerUser: 6,
                lastSyncAt: new Date('2026-01-01T12:00:00.000Z'),
                lastSyncError: null,
                updatedAt: new Date('2026-01-01T12:00:00.000Z'),
            }),
            updateSettings: async (_userId: string, input: Parameters<CallItService['updateSettings']>[1]) => ok({
                updateIntervalMinutes: input.updateIntervalMinutes ?? 15,
                maxActivePredictionsPerUser: input.maxActivePredictionsPerUser ?? 6,
                lastSyncAt: null,
                lastSyncError: null,
                updatedAt: new Date('2026-01-01T12:00:00.000Z'),
            }),
            canViewPrediction: async () => true,
            canViewTracker: async () => true,
        } as unknown as CallItService;
    });

    it('requires authentication for reads and prediction creation', async () => {
        authenticated = false;
        expect((await app().handle(new Request('http://localhost/callit/overview'))).status).toBe(401);
        expect((await app().handle(new Request('http://localhost/callit/predictions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ trackerId: 'tracker-1', direction: 'UP', durationKey: '1d', wager: 100 }),
        }))).status).toBe(401);
    });

    it('serves the overview with ISO timestamps and creates predictions', async () => {
        const overview = await app().handle(new Request('http://localhost/callit/overview'));
        expect(overview.status).toBe(200);
        expect(await overview.json()).toMatchObject({
            myActivePredictions: [{
                id: 'prediction-1',
                startAt: '2026-01-01T12:00:00.000Z',
                endsAt: '2026-01-02T12:00:00.000Z',
                tracker: { lastPriceAt: '2026-01-01T12:00:00.000Z' },
            }],
        });

        const created = await app().handle(new Request('http://localhost/callit/predictions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 'prediction-1', trackerId: 'tracker-1', direction: 'UP', durationKey: '1d', wager: 100 }),
        }));
        expect(created.status).toBe(201);
        expect(createdPrediction).toMatchObject({ id: 'prediction-1', wager: 100, direction: 'UP' });
    });

    it('serves tracker overview history for the main page', async () => {
        const response = await app().handle(new Request('http://localhost/callit/trackers/overview?historyDays=7'));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            items: [{
                id: 'tracker-1',
                activePredictionCount: 1,
                history: [{ observedAt: '2026-01-01T12:00:00.000Z', open: 99, high: 101, low: 98, close: 100 }],
            }],
        });

        const longRange = await app().handle(new Request('http://localhost/callit/trackers/overview?historyDays=1825'));
        expect(longRange.status).toBe(200);
        const tooLong = await app().handle(new Request('http://localhost/callit/trackers/overview?historyDays=1826'));
        expect(tooLong.status).toBe(422);
    });

    it('serves tracker detail history for up to five years', async () => {
        const response = await app().handle(new Request('http://localhost/callit/trackers/tracker-1?historyDays=1825'));
        expect(response.status).toBe(200);
        expect(trackerDetailHistoryDays).toBe(1825);

        const tooLong = await app().handle(new Request('http://localhost/callit/trackers/tracker-1?historyDays=1826'));
        expect(tooLong.status).toBe(422);
    });

    it('previews symbols and supports full tracker removal for admins only', async () => {
        expect((await app().handle(new Request('http://localhost/callit/admin/trackers/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ symbol: 'AAPL' }),
        }))).status).toBe(403);
        expect((await app().handle(new Request('http://localhost/callit/admin/trackers/tracker-1/full', {
            method: 'DELETE',
        }))).status).toBe(403);

        admin = true;
        const preview = await app().handle(new Request('http://localhost/callit/admin/trackers/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ symbol: 'AAPL' }),
        }));
        expect(preview.status).toBe(200);
        expect(await preview.json()).toMatchObject({
            symbol: 'AAPL',
            price: 100,
            marketState: 'REGULAR',
            history: [{ observedAt: '2026-01-01T12:00:00.000Z', open: 99, high: 101, low: 98, close: 100 }],
        });

        expect((await app().handle(new Request('http://localhost/callit/admin/trackers/tracker-1/full', {
            method: 'DELETE',
        }))).status).toBe(200);
    });

    it('restricts admin routes and reschedules the sync after settings updates', async () => {
        expect((await app().handle(new Request('http://localhost/callit/admin/settings'))).status).toBe(403);
        expect((await app().handle(new Request('http://localhost/callit/admin/trackers', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ symbol: 'AAPL' }),
        }))).status).toBe(403);

        admin = true;
        expect((await app().handle(new Request('http://localhost/callit/admin/settings'))).status).toBe(200);
        const updated = await app().handle(new Request('http://localhost/callit/admin/settings', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ updateIntervalMinutes: 30, maxActivePredictionsPerUser: 6 }),
        }));
        expect(updated.status).toBe(200);
        expect(rescheduled).toEqual([30]);

        const added = await app().handle(new Request('http://localhost/callit/admin/trackers', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ symbol: 'AAPL', name: 'Apple Inc.' }),
        }));
        expect(added.status).toBe(201);
    });
});

