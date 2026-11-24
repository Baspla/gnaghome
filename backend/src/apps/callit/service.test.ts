import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { user } from '../../platform/users/schema';
import { DiscussionsService } from '../../platform/discussions/service';
import { discussion, discussionMessage } from '../../platform/discussions/schema';
import { reaction } from '../../platform/reactions/schema';
import { ReactionsService } from '../../platform/reactions/service';
import type { ActivityFeedService } from '../../platform/activity-feed/service';
import type { NotificationsService } from '../../platform/notifications/service';
import type {
    MarketDataClient,
    MarketHistoryPoint,
    MarketQuote,
} from '../../integrations/yahoo-finance/client';
import { CallItService } from './service';
import { callItPrediction, callItPriceSnapshot, callItTracker } from './schema';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('CallItService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: CallItService;
    let discussions: DiscussionsService;
    let reactions: ReactionsService;
    let broadcast: ReturnType<typeof mock>;
    let recordActivity: ReturnType<typeof mock>;
    let notifyAll: ReturnType<typeof mock>;
    let notifyUsers: ReturnType<typeof mock>;
    let now: Date;
    let quotes: Map<string, MarketQuote>;
    let history: Map<string, MarketHistoryPoint[]>;
    let longHistory: Map<string, MarketHistoryPoint[]>;
    let historyRequests: Array<{ symbol: string; from: Date; to: Date; interval?: string }>;

    const marketData: MarketDataClient = {
        fetchQuote: async (symbol: string) => ok(quotes.get(symbol) ?? null),
        fetchQuotes: async (symbols: string[]) => ok(symbols.flatMap((symbol) => {
            const quote = quotes.get(symbol);
            return quote ? [quote] : [];
        })),
        fetchHistory: async (symbol: string, options) => {
            historyRequests.push({
                symbol,
                from: options.from,
                to: options.to,
                interval: options.interval,
            });
            const source = options.interval === '1d' ? longHistory : history;
            return ok(source.get(symbol) ?? []);
        },
    };

    function setQuote(symbol: string, price: number, currency = 'USD') {
        quotes.set(symbol, {
            symbol,
            price,
            currency,
            name: `${symbol} Inc.`,
            marketTime: now,
            marketState: 'REGULAR',
        });
    }

    async function addTracker(symbol = 'AAPL', price = 100) {
        setQuote(symbol, price);
        const result = await service.addTracker('admin-1', { symbol });
        if (!result.ok) throw new Error(result.error.message);
        return result.value.tracker;
    }

    async function createPrediction(
        userId: string,
        trackerId: string,
        overrides: Partial<{ id: string; direction: 'UP' | 'DOWN'; durationKey: '1d' | '2d' | '3d' | '5d' | '7d' | '1m'; wager: number }> = {},
    ) {
        return service.createPrediction(userId, {
            trackerId,
            direction: overrides.direction ?? 'UP',
            durationKey: overrides.durationKey ?? '1d',
            wager: overrides.wager ?? 100,
            ...(overrides.id ? { id: overrides.id } : {}),
        });
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        now = new Date('2026-01-01T00:00:00.000Z');
        quotes = new Map();
        history = new Map();
        longHistory = new Map();
        historyRequests = [];
        broadcast = mock(async () => ok(null));
        recordActivity = mock(async () => ok({}));
        notifyAll = mock(async () => {});
        notifyUsers = mock(async () => {});
        discussions = new DiscussionsService(database.db, broadcast);
        reactions = new ReactionsService(database.db, broadcast);
        service = new CallItService(
            database.db,
            marketData,
            discussions,
            { recordActivity } as unknown as Pick<ActivityFeedService, 'recordActivity'>,
            { notifyAll, notifyUsers } as unknown as Pick<NotificationsService, 'notifyAll' | 'notifyUsers'>,
            broadcast,
            reactions,
            () => now,
        );
        await database.db.insert(user).values([
            { id: 'admin-1', name: 'Admin', email: 'admin@example.test' },
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
            { id: 'user-3', name: 'Cara', email: 'cara@example.test' },
        ]);
    });

    afterEach(() => database.close());

    it('adds a tracker with a discussion, initial price, and backfilled history', async () => {
        history.set('AAPL', [
            { observedAt: new Date('2025-12-31T23:30:00.000Z'), price: 99 },
            { observedAt: new Date('2025-12-31T23:45:00.000Z'), price: 99.5 },
        ]);

        const tracker = await addTracker('AAPL', 100);
        expect(tracker).toMatchObject({
            symbol: 'AAPL',
            name: 'AAPL Inc.',
            currency: 'USD',
            isActive: true,
            lastPrice: 100,
        });
        expect(tracker.discussionId).toBeTruthy();

        const detail = await service.getTrackerDetail('user-1', tracker.id, { historyDays: 30 });
        expect(detail.ok).toBe(true);
        if (!detail.ok) return;
        expect(detail.value.history.map((point) => point.price)).toEqual([99, 99.5, 100]);
        expect(detail.value.commentCount).toBe(0);

        const trackerOverview = await service.listActiveTrackersWithHistory(30);
        expect(trackerOverview.ok).toBe(true);
        if (trackerOverview.ok) {
            expect(trackerOverview.value[0]?.history.map((point) => point.price)).toEqual([99, 99.5, 100]);
        }

        const duplicate = await service.addTracker('admin-1', { symbol: 'AAPL' });
        expect(duplicate).toMatchObject({ ok: false, error: { status: 409 } });

        expect(await service.removeTracker(tracker.id)).toMatchObject({ ok: true, value: null });
        const removedDetail = await service.getTrackerDetail('user-1', tracker.id);
        expect(removedDetail).toMatchObject({ ok: true, value: { tracker: { isActive: false } } });

        const reactivated = await service.addTracker('admin-1', { symbol: 'AAPL' });
        expect(reactivated).toMatchObject({ ok: true, value: { created: false, tracker: { isActive: true } } });
        if (!reactivated.ok) return;
        expect(reactivated.value.tracker.discussionId).toBe(tracker.discussionId);
    });

    it('backfills five years of daily history and lazily fills it for existing trackers', async () => {
        const tracker = await addTracker('AAPL', 100);
        const dailyRequests = () => historyRequests.filter((request) => request.interval === '1d');
        expect(dailyRequests()).toHaveLength(1);
        expect(dailyRequests()[0]?.from.getTime()).toBe(now.getTime() - 5 * 365 * DAY_MS);
        expect(dailyRequests()[0]?.to.getTime()).toBe(now.getTime());

        longHistory.set('AAPL', [
            { observedAt: new Date(now.getTime() - 4 * 365 * DAY_MS), price: 40 },
            { observedAt: new Date(now.getTime() - 180 * DAY_MS), price: 80 },
        ]);

        await service.getTrackerDetail('user-1', tracker.id, { historyDays: 30 });
        expect(dailyRequests()).toHaveLength(1);

        const detail = await service.getTrackerDetail('user-1', tracker.id, { historyDays: 365 });
        expect(dailyRequests()).toHaveLength(2);
        expect(detail.ok).toBe(true);
        if (detail.ok) {
            const prices = detail.value.history.map((point) => point.price);
            expect(prices).toContain(80);
            expect(prices).not.toContain(40);
        }

        const longRows = (await database.db.select().from(callItPriceSnapshot))
            .filter((row) => row.source === 'history');
        expect(longRows.map((row) => row.price).sort((a, b) => a - b)).toEqual([40, 80]);
    });

    it('refreshes long history when a removed tracker is reactivated', async () => {
        const tracker = await addTracker('AAPL', 100);
        const dailyRequestCount = () => historyRequests.filter((request) => request.interval === '1d').length;
        expect(dailyRequestCount()).toBe(1);

        expect(await service.removeTracker(tracker.id)).toMatchObject({ ok: true, value: null });
        longHistory.set('AAPL', [
            { observedAt: new Date(now.getTime() - 3 * 365 * DAY_MS), price: 60 },
        ]);

        expect(await service.addTracker('admin-1', { symbol: 'AAPL' }))
            .toMatchObject({ ok: true, value: { created: false, tracker: { isActive: true } } });
        expect(dailyRequestCount()).toBe(2);

        const longRows = (await database.db.select().from(callItPriceSnapshot))
            .filter((row) => row.source === 'history');
        expect(longRows.map((row) => row.price)).toContain(60);
    });

    it('validates prediction input, supports idempotent IDs, and enforces the active-prediction limit', async () => {
        const tracker = await addTracker();
        expect(await createPrediction('user-1', tracker.id, { wager: 125 }))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await createPrediction('user-1', tracker.id, { direction: 'SIDEWAYS' as 'UP' }))
            .toMatchObject({ ok: false, error: { status: 400 } });

        const created = await createPrediction('user-1', tracker.id, { id: 'prediction-1', wager: 250 });
        expect(created).toMatchObject({
            ok: true,
            value: {
                id: 'prediction-1',
                created: true,
                wager: 250,
                startPrice: 100,
                status: 'ACTIVE',
                reactionCount: 0,
                reactionEmoji: null,
            },
        });

        const repeated = await createPrediction('user-1', tracker.id, { id: 'prediction-1', wager: 250 });
        expect(repeated).toMatchObject({ ok: true, value: { id: 'prediction-1', created: false } });
        expect(await createPrediction('user-1', tracker.id, { id: 'prediction-1', wager: 500 }))
            .toMatchObject({ ok: false, error: { status: 409 } });

        for (let index = 0; index < 5; index += 1) {
            expect((await createPrediction('user-1', tracker.id)).ok).toBe(true);
        }
        const overLimit = await createPrediction('user-1', tracker.id);
        expect(overLimit).toMatchObject({ ok: false, error: { status: 409 } });
        if (!overLimit.ok) expect(overLimit.error.message).toContain('6');

        const otherUser = await createPrediction('user-2', tracker.id);
        expect(otherUser).toMatchObject({ ok: true, value: { created: true } });

        const overview = await service.getOverview('user-1');
        expect(overview).toMatchObject({
            ok: true,
            value: {
                leaderboard: [
                    { rank: 1, user: { id: 'user-1' }, allTimeProfit: 0, completedCount: 0 },
                    { rank: 2, user: { id: 'user-2' }, allTimeProfit: 0, completedCount: 0 },
                ],
            },
        });
    });

    it('records a feed activity and notifies others when a prediction is created', async () => {
        const tracker = await addTracker();
        const created = await createPrediction('user-1', tracker.id, {
            id: 'prediction-created',
            direction: 'UP',
            wager: 250,
        });
        expect(created).toMatchObject({ ok: true, value: { created: true } });

        expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({
            type: 'callit.prediction.created',
            actorUserId: 'user-1',
            target: { type: 'callit.prediction', id: 'prediction-created' },
            discussionId: tracker.discussionId,
            data: { trackerId: tracker.id, trackerSymbol: 'AAPL', direction: 'UP' },
        }));
        expect(notifyAll).toHaveBeenCalledWith('callit.prediction.new', ['user-1'], expect.objectContaining({
            body: expect.stringContaining('AAPL'),
            url: `/callit/trackers/${tracker.id}`,
        }));
    });

    it('records completion activities and sends result notifications when predictions resolve', async () => {
        const tracker = await addTracker('AAPL', 100);
        const up = await createPrediction('user-1', tracker.id, {
            id: 'prediction-up',
            direction: 'UP',
            wager: 1000,
        });
        const down = await createPrediction('user-2', tracker.id, {
            id: 'prediction-down',
            direction: 'DOWN',
            wager: 1000,
        });
        expect(up.ok && down.ok).toBe(true);

        now = new Date(now.getTime() + 2 * DAY_MS);
        setQuote('AAPL', 110);
        expect(await service.syncPrices()).toMatchObject({ ok: true, value: { predictionsResolved: 2 } });

        const activityInputs = recordActivity.mock.calls.map((call) => call[0]);
        expect(activityInputs).toContainEqual(expect.objectContaining({
            type: 'callit.prediction.completed',
            subjectUserId: 'user-1',
            target: { type: 'callit.prediction', id: 'prediction-up' },
            discussionId: tracker.discussionId,
            data: { trackerId: tracker.id, trackerSymbol: 'AAPL', direction: 'UP', successful: true },
        }));
        expect(activityInputs).toContainEqual(expect.objectContaining({
            type: 'callit.prediction.completed',
            subjectUserId: 'user-2',
            target: { type: 'callit.prediction', id: 'prediction-down' },
            discussionId: tracker.discussionId,
            data: { trackerId: tracker.id, trackerSymbol: 'AAPL', direction: 'DOWN', successful: false },
        }));

        expect(notifyUsers).toHaveBeenCalledWith('callit.prediction.mine-completed', ['user-1'], expect.objectContaining({
            body: expect.stringContaining('Steigt: erfolgreich'),
            url: '/callit/users/user-1',
        }));
        expect(notifyUsers).toHaveBeenCalledWith('callit.prediction.mine-completed', ['user-2'], expect.objectContaining({
            body: expect.stringContaining('Fällt: nicht erfolgreich'),
        }));
        expect(notifyAll).toHaveBeenCalledWith('callit.prediction.completed', ['user-1'], expect.objectContaining({
            body: expect.stringContaining('Alice'),
        }));
        expect(notifyAll).toHaveBeenCalledWith('callit.prediction.completed', ['user-2'], expect.objectContaining({
            body: expect.stringContaining('Bob'),
        }));
    });

    it('resolves due predictions using the next sync price and builds the leaderboard', async () => {
        const tracker = await addTracker('AAPL', 100);
        const up = await createPrediction('user-1', tracker.id, { direction: 'UP', wager: 1000 });
        const down = await createPrediction('user-2', tracker.id, { direction: 'DOWN', wager: 1000 });
        expect(up.ok && down.ok).toBe(true);

        now = new Date(now.getTime() + 2 * DAY_MS);
        setQuote('AAPL', 110);
        const sync = await service.syncPrices();
        expect(sync).toMatchObject({ ok: true, value: { trackersUpdated: 1, predictionsResolved: 2 } });

        const alice = await service.getUserPage('user-1', 'user-1');
        expect(alice).toMatchObject({
            ok: true,
            value: {
                stats: { activePredictionCount: 0, allTimeProfit: 100, completedCount: 1, wins: 1, losses: 0 },
                completedPredictions: [{
                    direction: 'UP',
                    status: 'COMPLETED',
                    endPrice: 110,
                    profitLoss: 100,
                    priceChangePercent: expect.any(Number),
                }],
            },
        });
        const bob = await service.getUserPage('user-1', 'user-2');
        expect(bob).toMatchObject({
            ok: true,
            value: { stats: { allTimeProfit: -100, completedCount: 1, wins: 0, losses: 1 } },
        });

        const overview = await service.getOverview('user-1');
        expect(overview.ok).toBe(true);
        if (!overview.ok) return;
        expect(overview.value.myActivePredictions).toHaveLength(0);
        expect(overview.value.leaderboard).toMatchObject([
            { rank: 1, user: { id: 'user-1' }, allTimeProfit: 100, completedCount: 1, wins: 1, losses: 0 },
            { rank: 2, user: { id: 'user-2' }, allTimeProfit: -100, completedCount: 1, wins: 0, losses: 1 },
        ]);

        const secondSync = await service.syncPrices();
        expect(secondSync).toMatchObject({ ok: true, value: { predictionsResolved: 0 } });
    });

    it('keeps syncing removed trackers while they still have active predictions', async () => {
        const tracker = await addTracker('TSLA', 200);
        const created = await createPrediction('user-1', tracker.id, { durationKey: '1d' });
        expect(created.ok).toBe(true);
        expect(await service.removeTracker(tracker.id)).toMatchObject({ ok: true, value: null });

        now = new Date(now.getTime() + 2 * DAY_MS);
        setQuote('TSLA', 220);
        const sync = await service.syncPrices();
        expect(sync).toMatchObject({ ok: true, value: { trackersUpdated: 1, predictionsResolved: 1 } });

        const page = await service.getUserPage('user-1', 'user-1');
        expect(page).toMatchObject({ ok: true, value: { completedPredictions: [{ profitLoss: 10, status: 'COMPLETED' }] } });
    });

    it('serves tracker comments and prediction reactions through the shared platform systems', async () => {
        const tracker = await addTracker();
        const created = await createPrediction('user-1', tracker.id, { id: 'reaction-prediction' });
        expect(created.ok).toBe(true);
        if (!created.ok) return;

        const detail = await service.getTrackerDetail('user-1', tracker.id);
        expect(detail.ok).toBe(true);
        if (!detail.ok || !detail.value.tracker.discussionId) throw new Error('tracker discussion missing');
        const message = await discussions.createMessage(detail.value.tracker.discussionId, 'user-2', 'Interessanter Tracker');
        expect(message.ok).toBe(true);
        const withComment = await service.getTrackerDetail('user-1', tracker.id);
        expect(withComment).toMatchObject({ ok: true, value: { commentCount: 1 } });

        const reaction = await reactions.toggleReaction('callit.prediction', created.value.id, 'user-2', '❤️');
        expect(reaction.ok).toBe(true);
        const overview = await service.getOverview('user-1');
        expect(overview).toMatchObject({
            ok: true,
            value: {
                myActivePredictions: [{
                    id: 'reaction-prediction',
                    reactionCount: 1,
                    reactionEmoji: '❤️',
                }],
            },
        });

        expect(await service.canViewPrediction('user-1', created.value.id)).toBe(true);
        expect(await service.canViewPrediction('user-1', 'missing')).toBe(false);
        expect(await service.canViewTracker('user-1', tracker.id)).toBe(true);
        expect(await service.canViewTracker('user-1', 'missing')).toBe(false);
    });

    it('reads and updates global settings within their allowed ranges', async () => {
        expect(await service.getSettings()).toMatchObject({
            ok: true,
            value: { updateIntervalMinutes: 15, maxActivePredictionsPerUser: 6 },
        });
        expect(await service.updateSettings('admin-1', { updateIntervalMinutes: 30, maxActivePredictionsPerUser: 3 }))
            .toMatchObject({
                ok: true,
                value: { updateIntervalMinutes: 30, maxActivePredictionsPerUser: 3 },
            });
        expect(await service.getSettings()).toMatchObject({
            ok: true,
            value: { updateIntervalMinutes: 30, maxActivePredictionsPerUser: 3 },
        });
        expect(await service.updateSettings('admin-1', { updateIntervalMinutes: 7 as 5 }))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.updateSettings('admin-1', { maxActivePredictionsPerUser: 0 }))
            .toMatchObject({ ok: false, error: { status: 400 } });
    });

    it('previews symbols with quote, history, and existing-tracker status without creating anything', async () => {
        setQuote('AAPL', 100);
        history.set('AAPL', [
            { observedAt: new Date('2025-12-31T23:30:00.000Z'), price: 99 },
            { observedAt: new Date('2025-12-31T23:45:00.000Z'), price: 99.5 },
        ]);

        const preview = await service.previewTracker('aapl');
        expect(preview).toMatchObject({
            ok: true,
            value: {
                symbol: 'AAPL',
                name: 'AAPL Inc.',
                currency: 'USD',
                price: 100,
                marketState: 'REGULAR',
                existingTracker: null,
            },
        });
        if (preview.ok) {
            expect(preview.value.history.map((point) => point.price)).toEqual([99, 99.5]);
        }
        expect(await database.db.select().from(callItTracker)).toHaveLength(0);
        expect(await database.db.select().from(callItPriceSnapshot)).toHaveLength(0);
        expect(await database.db.select().from(discussion)).toHaveLength(0);

        const tracker = await addTracker('AAPL', 100);
        const activePreview = await service.previewTracker('AAPL');
        expect(activePreview).toMatchObject({
            ok: true,
            value: { existingTracker: { id: tracker.id, isActive: true } },
        });

        expect(await service.removeTracker(tracker.id)).toMatchObject({ ok: true, value: null });
        const inactivePreview = await service.previewTracker('AAPL');
        expect(inactivePreview).toMatchObject({
            ok: true,
            value: { existingTracker: { id: tracker.id, isActive: false } },
        });
    });

    it('fully removes a tracker with its predictions, history, reactions, and comments', async () => {
        const tracker = await addTracker();
        const created = await createPrediction('user-1', tracker.id, { id: 'full-remove-prediction' });
        expect(created.ok).toBe(true);
        if (!created.ok) return;

        const detail = await service.getTrackerDetail('user-1', tracker.id);
        if (!detail.ok || !detail.value.tracker.discussionId) throw new Error('tracker discussion missing');
        await discussions.createMessage(detail.value.tracker.discussionId, 'user-2', 'Kommentar');
        await reactions.toggleReaction('callit.prediction', created.value.id, 'user-2', '❤️');

        expect(await service.fullyRemoveTracker(tracker.id)).toMatchObject({ ok: true, value: null });

        expect(await database.db.select().from(callItTracker)).toHaveLength(0);
        expect(await database.db.select().from(callItPrediction)).toHaveLength(0);
        expect(await database.db.select().from(callItPriceSnapshot)).toHaveLength(0);
        expect(await database.db.select().from(reaction)).toHaveLength(0);
        expect(await database.db.select().from(discussion)).toHaveLength(0);
        expect(await database.db.select().from(discussionMessage)).toHaveLength(0);

        const events = broadcast.mock.calls.map((call) => call[1]);
        expect(events).toContainEqual(expect.objectContaining({
            type: 'callit.prediction.changed',
            action: 'DELETED',
            entityId: created.value.id,
        }));
        expect(events).toContainEqual(expect.objectContaining({
            type: 'callit.user-stats.changed',
            action: 'UPDATED',
            entityId: 'user-1',
        }));
        expect(events).toContainEqual(expect.objectContaining({
            type: 'callit.tracker.changed',
            action: 'DELETED',
            entityId: tracker.id,
        }));

        expect(await service.fullyRemoveTracker(tracker.id)).toMatchObject({ ok: false, error: { status: 404 } });
    });
});
