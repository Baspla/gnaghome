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
    MarketCandle,
    MarketDataClient,
    MarketQuote,
} from '../../integrations/yahoo-finance/client';
import { CallItService } from './service';
import { callItPrediction, callItPriceCandle, callItTracker } from './schema';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function candle(ts: Date | string, close: number, overrides: Partial<MarketCandle> = {}): MarketCandle {
    return {
        ts: ts instanceof Date ? ts : new Date(ts),
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000,
        ...overrides,
    };
}

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
    let history: Map<string, MarketCandle[]>;
    let longHistory: Map<string, MarketCandle[]>;
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

    it('adds a tracker with a discussion, initial price, and backfilled candles', async () => {
        longHistory.set('AAPL', [
            candle('2025-12-30T14:30:00.000Z', 98),
            candle('2025-12-31T14:30:00.000Z', 99),
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
        expect(detail.value.history.map((point) => point.price)).toEqual([98, 99]);
        expect(detail.value.commentCount).toBe(0);

        const trackerOverview = await service.listActiveTrackersWithHistory(30);
        expect(trackerOverview.ok).toBe(true);
        if (trackerOverview.ok) {
            expect(trackerOverview.value[0]?.history.map((point) => point.price)).toEqual([98, 99]);
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

    it('backfills hourly and daily candles and fills gaps with upserts', async () => {
        const initialHourlyTs = new Date(now.getTime() - 2 * HOUR_MS);
        const initialDailyTs = new Date(now.getTime() - DAY_MS);
        history.set('AAPL', [candle(initialHourlyTs, 90)]);
        longHistory.set('AAPL', [candle(initialDailyTs, 80)]);

        await addTracker('AAPL', 100);
        const hourlyRequests = () => historyRequests.filter((request) => request.interval === '1h');
        const dailyRequests = () => historyRequests.filter((request) => request.interval === '1d');
        expect(hourlyRequests()).toHaveLength(1);
        expect(hourlyRequests()[0]?.from.getTime()).toBe(now.getTime() - 60 * DAY_MS);
        expect(hourlyRequests()[0]?.to.getTime()).toBe(now.getTime());
        expect(dailyRequests()).toHaveLength(1);
        expect(dailyRequests()[0]?.from.getTime()).toBe(new Date('1970-01-01T00:00:00.000Z').getTime());
        expect(dailyRequests()[0]?.to.getTime()).toBe(now.getTime());

        now = new Date(now.getTime() + 3 * DAY_MS);
        setQuote('AAPL', 100);
        expect(await service.syncPrices()).toMatchObject({ ok: true });
        expect(hourlyRequests()).toHaveLength(2);
        expect(hourlyRequests()[1]?.from.getTime()).toBe(initialHourlyTs.getTime() - HOUR_MS);
        expect(dailyRequests()).toHaveLength(2);
        expect(dailyRequests()[1]?.from.getTime()).toBe(initialDailyTs.getTime() - DAY_MS);

        history.set('AAPL', [candle(initialHourlyTs, 95)]);
        now = new Date(now.getTime() + 2 * HOUR_MS);
        setQuote('AAPL', 100);
        expect(await service.syncPrices()).toMatchObject({ ok: true });
        const hourlyRows = (await database.db.select().from(callItPriceCandle))
            .filter((row) => row.interval === '1h' && row.ts.getTime() === initialHourlyTs.getTime());
        expect(hourlyRows).toHaveLength(1);
        expect(hourlyRows[0]?.close).toBe(95);
    });

    it('refreshes candles at most once per hour during price syncs', async () => {
        await addTracker('AAPL', 100);
        const baseline = historyRequests.length;

        setQuote('AAPL', 100);
        expect(await service.syncPrices()).toMatchObject({ ok: true });
        expect(historyRequests.length).toBe(baseline + 2);

        now = new Date(now.getTime() + 15 * 60 * 1000);
        setQuote('AAPL', 101);
        expect(await service.syncPrices()).toMatchObject({ ok: true });
        expect(historyRequests.length).toBe(baseline + 2);

        now = new Date(now.getTime() + HOUR_MS);
        setQuote('AAPL', 102);
        expect(await service.syncPrices()).toMatchObject({ ok: true });
        expect(historyRequests.length).toBe(baseline + 4);
    });

    it('queries hourly candles for short ranges and daily candles for long ranges', async () => {
        history.set('AAPL', [candle(new Date(now.getTime() - 2 * HOUR_MS), 111)]);
        longHistory.set('AAPL', [candle(new Date(now.getTime() - 2 * DAY_MS), 222)]);
        const tracker = await addTracker('AAPL', 100);

        const week = await service.getTrackerDetail('user-1', tracker.id, { historyDays: 7 });
        expect(week.ok && week.value.history.map((point) => point.price)).toEqual([111]);

        const month = await service.getTrackerDetail('user-1', tracker.id, { historyDays: 30 });
        expect(month.ok && month.value.history.map((point) => point.price)).toEqual([222]);

        const overview = await service.listActiveTrackersWithHistory(7);
        expect(overview.ok && overview.value[0]?.history.map((point) => point.price)).toEqual([111]);
    });

    it('refreshes candles when a removed tracker is reactivated', async () => {
        const tracker = await addTracker('AAPL', 100);
        expect(historyRequests).toHaveLength(2);

        expect(await service.removeTracker(tracker.id)).toMatchObject({ ok: true, value: null });
        history.set('AAPL', [candle(new Date(now.getTime() - 2 * HOUR_MS), 61)]);
        longHistory.set('AAPL', [candle(new Date(now.getTime() - 2 * DAY_MS), 60)]);

        expect(await service.addTracker('admin-1', { symbol: 'AAPL' }))
            .toMatchObject({ ok: true, value: { created: false, tracker: { isActive: true } } });
        expect(historyRequests).toHaveLength(4);

        const rows = await database.db.select().from(callItPriceCandle);
        expect(rows.filter((row) => row.interval === '1h').map((row) => row.close)).toContain(61);
        expect(rows.filter((row) => row.interval === '1d').map((row) => row.close)).toContain(60);
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

    it('counts open results in stats and the leaderboard', async () => {
        const tracker = await addTracker('AAPL', 100);
        const created = await createPrediction('user-1', tracker.id, { direction: 'UP', durationKey: '7d', wager: 1000 });
        expect(created.ok).toBe(true);

        now = new Date(now.getTime() + DAY_MS);
        setQuote('AAPL', 110);
        expect(await service.syncPrices()).toMatchObject({ ok: true, value: { predictionsResolved: 0 } });

        const overview = await service.getOverview('user-1');
        expect(overview).toMatchObject({
            ok: true,
            value: {
                myStats: {
                    activePredictionCount: 1,
                    activeWagerTotal: 1000,
                    allTimeProfit: 0,
                    unrealizedProfit: 100,
                    completedCount: 0,
                },
                leaderboard: [{
                    rank: 1,
                    user: { id: 'user-1' },
                    allTimeProfit: 100,
                    unrealizedProfit: 100,
                    activeCount: 1,
                    completedCount: 0,
                }],
            },
        });
    });

    it('serves long-range daily candles for the tracker overview', async () => {
        longHistory.set('AAPL', [
            candle('2024-01-02T20:00:00.000Z', 80),
            candle('2025-01-02T20:00:00.000Z', 90),
        ]);
        const tracker = await addTracker('AAPL', 100);
        expect(tracker.id).toBeTruthy();
        const requestsAfterAdd = historyRequests.length;

        const overview = await service.listActiveTrackersWithHistory(1825);
        expect(overview.ok).toBe(true);
        if (!overview.ok) return;
        expect(overview.value[0]?.history.map((point) => point.price)).toEqual([80, 90]);
        expect(historyRequests).toHaveLength(requestsAfterAdd);
        expect(historyRequests.some((request) => request.symbol === 'AAPL' && request.interval === '1d')).toBe(true);
        expect(await service.listActiveTrackersWithHistory(1826))
            .toMatchObject({ ok: false, error: { status: 400 } });
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
        longHistory.set('AAPL', [
            candle('2025-12-30T14:30:00.000Z', 99),
            candle('2025-12-31T14:30:00.000Z', 99.5),
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
        expect(historyRequests[historyRequests.length - 1]?.interval).toBe('1d');
        expect(await database.db.select().from(callItTracker)).toHaveLength(0);
        expect(await database.db.select().from(callItPriceCandle)).toHaveLength(0);
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
        expect(await database.db.select().from(callItPriceCandle)).toHaveLength(0);
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
