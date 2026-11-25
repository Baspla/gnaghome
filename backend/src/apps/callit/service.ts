import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { createLogger } from '../../lib/logger';
import {
    err,
    ok,
    type BadRequestError,
    type ConflictError,
    type InternalError,
    type NotFoundError,
    type Result,
} from '../../lib/result';
import type { BroadcastPublisher } from '../../platform/realtime/service';
import { RealtimeChannels } from '$shared/constants';
import type {
    CallItPredictionChangedEvent,
    CallItSettingsChangedEvent,
    CallItTrackerChangedEvent,
    CallItUserStatsChangedEvent,
} from '$shared/dto/platform-event';
import type { DiscussionsService } from '../../platform/discussions/service';
import type { ActivityFeedService } from '../../platform/activity-feed/service';
import type { NotificationsService } from '../../platform/notifications/service';
import type { ReactionsService } from '../../platform/reactions/service';
import { user } from '../../platform/users/schema';
import type { MarketCandle, MarketDataClient, MarketQuote } from '../../integrations/yahoo-finance/client';
import {
    callItPrediction,
    callItPriceCandle,
    callItSettings,
    callItTracker,
    type CallItPrediction,
    type CallItTracker,
} from './schema';

const logger = createLogger('callit');

export const CALL_IT_DIRECTIONS = ['UP', 'DOWN'] as const;
export const CALL_IT_DURATIONS = ['1d', '2d', '3d', '5d', '7d', '1m'] as const;
export const CALL_IT_WAGERS = [100, 250, 500, 1000] as const;
export const CALL_IT_UPDATE_INTERVALS = [5, 10, 15, 20, 30, 60] as const;
export const CALL_IT_SETTINGS_ID = 'settings';
export const CALL_IT_DEFAULT_UPDATE_INTERVAL_MINUTES = 15;
export const CALL_IT_DEFAULT_MAX_ACTIVE_PREDICTIONS = 6;
export const CALL_IT_MAX_ACTIVE_PREDICTIONS_LIMIT = 50;
export const CALL_IT_REACTION_TARGET_TYPE = 'callit.prediction';
export const CALL_IT_DISCUSSION_TARGET_TYPE = 'callit.tracker';

const DURATION_DAYS: Record<CallItDurationKey, number> = {
    '1d': 1,
    '2d': 2,
    '3d': 3,
    '5d': 5,
    '7d': 7,
    '1m': 30,
};
const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const CANDLE_INTERVALS = ['15m', '1h', '1d'] as const;
const CANDLE_INTERVAL_MS: Record<CallItCandleInterval, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': DAY_MS,
};
const FIFTEEN_MINUTE_LOOKBACK_DAYS = 30;
const HOURLY_LOOKBACK_DAYS = 60;
const DAILY_HISTORY_START = new Date('1970-01-01T00:00:00.000Z');
const INTRADAY_HISTORY_DAYS = 7;
const CANDLE_REFRESH_INTERVALS_MS: Record<CallItCandleInterval, number> = {
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 60 * 60 * 1000,
};
const CANDLE_CLEANUP_INTERVAL_MS = DAY_MS;
const FIFTEEN_MINUTE_RETENTION_DAYS = 30;
const HOURLY_RETENTION_DAYS = 60;
const CANDLE_CHUNK_SIZE = 100;
export const CALL_IT_MAX_HISTORY_DAYS = 5 * 365;
const MAX_COMPLETED_PREDICTIONS = 100;

export type CallItUserSummary = { id: string; name: string; image: string | null };

export type CallItTrackerSummary = {
    id: string;
    symbol: string;
    name: string;
    currency: string | null;
    isActive: boolean;
    lastPrice: number | null;
    lastPriceAt: Date | null;
    discussionId: string | null;
};

export type CallItTrackerListItem = CallItTrackerSummary & { activePredictionCount: number };
export type CallItHistoryPoint = {
    observedAt: Date;
    open: number;
    high: number;
    low: number;
    close: number;
};
export type CallItTrackerOverviewItem = CallItTrackerListItem & {
    history: CallItHistoryPoint[];
};

export type CallItTrackerPreview = {
    symbol: string;
    name: string | null;
    currency: string | null;
    price: number;
    marketTime: Date | null;
    marketState: string | null;
    history: CallItHistoryPoint[];
    existingTracker: { id: string; isActive: boolean } | null;
};

export type CallItPredictionSummary = {
    id: string;
    user: CallItUserSummary;
    tracker: CallItTrackerSummary;
    direction: CallItDirection;
    durationKey: CallItDurationKey;
    wager: number;
    startPrice: number;
    startAt: Date;
    endsAt: Date;
    status: 'ACTIVE' | 'COMPLETED';
    endPrice: number | null;
    resolvedAt: Date | null;
    profitLoss: number | null;
    priceChangePercent: number | null;
    currentPrice: number | null;
    currentPriceAt: Date | null;
    unrealizedProfitLoss: number | null;
    reactionCount: number;
    reactionEmoji: string | null;
};

export type CallItStats = {
    activePredictionCount: number;
    activeWagerTotal: number;
    allTimeProfit: number;
    unrealizedProfit: number;
    completedCount: number;
    wins: number;
    losses: number;
};

export type CallItLeaderboardEntry = {
    rank: number;
    user: CallItUserSummary;
    allTimeProfit: number;
    unrealizedProfit: number;
    activeCount: number;
    completedCount: number;
    wins: number;
    losses: number;
};

export type CallItLimits = { maxActivePredictionsPerUser: number };

export type CallItOverview = {
    myStats: CallItStats;
    limits: CallItLimits;
    myActivePredictions: CallItPredictionSummary[];
    otherActivePredictions: CallItPredictionSummary[];
    leaderboard: CallItLeaderboardEntry[];
};

export type CallItUserPage = {
    user: CallItUserSummary;
    stats: CallItStats;
    limits: CallItLimits;
    activePredictions: CallItPredictionSummary[];
    completedPredictions: CallItPredictionSummary[];
};

export type CallItTrackerDetail = {
    tracker: CallItTrackerSummary;
    commentCount: number;
    history: CallItHistoryPoint[];
    activePredictions: CallItPredictionSummary[];
    completedPredictions: CallItPredictionSummary[];
};

export type CallItSettingsView = {
    updateIntervalMinutes: number;
    maxActivePredictionsPerUser: number;
    lastSyncAt: Date | null;
    lastSyncError: string | null;
    updatedAt: Date;
};

export type CallItSyncResult = {
    trackersUpdated: number;
    predictionsResolved: number;
    errors: string[];
};

export type CallItError = BadRequestError | ConflictError | NotFoundError | InternalError;

type PredictionJoinRow = {
    prediction: CallItPrediction;
    tracker: CallItTracker;
    user: CallItUserSummary;
};

function validId(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function normalizeSymbol(value: string): string {
    return value.trim().toUpperCase();
}

function isDirection(value: unknown): value is CallItDirection {
    return typeof value === 'string' && (CALL_IT_DIRECTIONS as readonly string[]).includes(value);
}

function isDurationKey(value: unknown): value is CallItDurationKey {
    return typeof value === 'string' && (CALL_IT_DURATIONS as readonly string[]).includes(value);
}

function isWager(value: unknown): value is CallItWager {
    return typeof value === 'number' && (CALL_IT_WAGERS as readonly number[]).includes(value);
}

function isUpdateInterval(value: unknown): value is CallItUpdateInterval {
    return typeof value === 'number' && (CALL_IT_UPDATE_INTERVALS as readonly number[]).includes(value);
}

function directionLabel(direction: CallItDirection): string {
    return direction === 'UP' ? 'Steigt' : 'Fällt';
}

function toUserSummary(row: { id: string; name: string; image: string | null }): CallItUserSummary {
    return { id: row.id, name: row.name, image: row.image };
}

function toTrackerSummary(tracker: CallItTracker): CallItTrackerSummary {
    return {
        id: tracker.id,
        symbol: tracker.symbol,
        name: tracker.name,
        currency: tracker.currency,
        isActive: tracker.isActive,
        lastPrice: tracker.lastPrice,
        lastPriceAt: tracker.lastPriceAt,
        discussionId: tracker.discussionId,
    };
}

function computeProfit(
    wager: number,
    direction: CallItDirection,
    startPrice: number,
    endPrice: number,
): { profitLoss: number; priceChangePercent: number } {
    const priceChangePercent = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    const signedPercent = direction === 'UP' ? priceChangePercent : -priceChangePercent;
    return {
        profitLoss: Math.round(wager * (signedPercent / 100)),
        priceChangePercent,
    };
}

type StatsInput = Pick<CallItPrediction, 'status' | 'wager' | 'direction' | 'startPrice' | 'profitLoss'> & {
    currentPrice: number | null;
};

function computeStats(predictions: StatsInput[]): CallItStats {
    let activePredictionCount = 0;
    let activeWagerTotal = 0;
    let allTimeProfit = 0;
    let unrealizedProfit = 0;
    let completedCount = 0;
    let wins = 0;
    let losses = 0;

    for (const prediction of predictions) {
        if (prediction.status === 'ACTIVE') {
            activePredictionCount += 1;
            activeWagerTotal += prediction.wager;
            if (prediction.currentPrice !== null && prediction.currentPrice > 0) {
                unrealizedProfit += computeProfit(
                    prediction.wager,
                    prediction.direction,
                    prediction.startPrice,
                    prediction.currentPrice,
                ).profitLoss;
            }
            continue;
        }
        completedCount += 1;
        const profit = prediction.profitLoss ?? 0;
        allTimeProfit += profit;
        if (profit > 0) wins += 1;
        else if (profit < 0) losses += 1;
    }

    return {
        activePredictionCount,
        activeWagerTotal,
        allTimeProfit,
        unrealizedProfit,
        completedCount,
        wins,
        losses,
    };
}

function intervalForHistoryDays(days: number): CallItCandleInterval {
    if (days <= 1) return '15m';
    return days <= INTRADAY_HISTORY_DAYS ? '1h' : '1d';
}

function downsampleHistory(
    points: CallItHistoryPoint[],
    maxPoints = MAX_HISTORY_POINTS,
): CallItHistoryPoint[] {
    if (points.length <= maxPoints) return points;
    const step = (points.length - 1) / (maxPoints - 1);
    const sampled: CallItHistoryPoint[] = [];
    for (let index = 0; index < maxPoints; index += 1) {
        sampled.push(points[Math.round(index * step)]!);
    }
    return sampled.filter((point, index) => index === 0
        || point.observedAt.getTime() !== sampled[index - 1]!.observedAt.getTime());
}

function chunks<T>(values: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
    return result;
}

type CreatePredictionInput = {
    id?: string;
    trackerId: string;
    direction: CallItDirection;
    durationKey: CallItDurationKey;
    wager: number;
};

type UpdateSettingsInput = {
    updateIntervalMinutes?: number;
    maxActivePredictionsPerUser?: number;
};

const MAX_TRACKER_COMPLETED_PREDICTIONS = 50;
const MAX_HISTORY_POINTS = 1000;
const MAX_SYNC_ERROR_LENGTH = 1000;

export type CallItDirection = typeof CALL_IT_DIRECTIONS[number];
export type CallItDurationKey = typeof CALL_IT_DURATIONS[number];
export type CallItWager = typeof CALL_IT_WAGERS[number];
export type CallItUpdateInterval = typeof CALL_IT_UPDATE_INTERVALS[number];
export type CallItCandleInterval = typeof CANDLE_INTERVALS[number];

export class CallItService {
    constructor(
        private readonly db: AppDatabase,
        private readonly marketData: MarketDataClient,
        private readonly discussions: Pick<DiscussionsService, 'getOrCreateDiscussion' | 'deleteDiscussion' | 'getMessageCounts'>,
        private readonly activityFeed: Pick<ActivityFeedService, 'recordActivity'>,
        private readonly notifications: Pick<NotificationsService, 'notifyAll' | 'notifyUsers'>,
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
        private readonly reactions?: Pick<ReactionsService, 'getCounts' | 'getRandomReactionEmojis' | 'deleteTargetReactions'>,
        private readonly clock: () => Date = () => new Date(),
    ) {}

    private readonly lastCandleRefreshAt = new Map<CallItCandleInterval, Date>();
    private lastCandleCleanupAt: Date | null = null;

    private async ensureSettings() {
        const now = this.clock();
        await this.db.insert(callItSettings).values({
            id: CALL_IT_SETTINGS_ID,
            updateIntervalMinutes: CALL_IT_DEFAULT_UPDATE_INTERVAL_MINUTES,
            maxActivePredictionsPerUser: CALL_IT_DEFAULT_MAX_ACTIVE_PREDICTIONS,
            lastSyncAt: null,
            lastSyncError: null,
            updatedByUserId: null,
            updatedAt: now,
        }).onConflictDoNothing();
        const [settings] = await this.db.select().from(callItSettings)
            .where(eq(callItSettings.id, CALL_IT_SETTINGS_ID)).limit(1);
        if (!settings) throw new Error('Call It settings could not be loaded');
        return settings;
    }

    private toSettingsView(settings: typeof callItSettings.$inferSelect): CallItSettingsView {
        return {
            updateIntervalMinutes: settings.updateIntervalMinutes,
            maxActivePredictionsPerUser: settings.maxActivePredictionsPerUser,
            lastSyncAt: settings.lastSyncAt,
            lastSyncError: settings.lastSyncError,
            updatedAt: settings.updatedAt,
        };
    }

    async getSettings(): Promise<Result<CallItSettingsView, InternalError>> {
        try {
            return ok(this.toSettingsView(await this.ensureSettings()));
        } catch (error) {
            logger.error('failed to load settings', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Call-it-Einstellungen konnten nicht geladen werden.' });
        }
    }

    async updateSettings(
        updatedByUserId: string,
        input: UpdateSettingsInput,
    ): Promise<Result<CallItSettingsView, BadRequestError | InternalError>> {
        if (input.updateIntervalMinutes !== undefined && !isUpdateInterval(input.updateIntervalMinutes)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Das Aktualisierungsintervall ist ungültig.' });
        }
        if (input.maxActivePredictionsPerUser !== undefined
            && (!Number.isInteger(input.maxActivePredictionsPerUser)
                || input.maxActivePredictionsPerUser < 1
                || input.maxActivePredictionsPerUser > CALL_IT_MAX_ACTIVE_PREDICTIONS_LIMIT)) {
            return err({
                status: 400,
                code: 'BAD_REQUEST',
                message: `Das Limit muss zwischen 1 und ${CALL_IT_MAX_ACTIVE_PREDICTIONS_LIMIT} liegen.`,
            });
        }

        try {
            const settings = await this.ensureSettings();
            const now = this.clock();
            const [updated] = await this.db.update(callItSettings).set({
                updateIntervalMinutes: input.updateIntervalMinutes ?? settings.updateIntervalMinutes,
                maxActivePredictionsPerUser: input.maxActivePredictionsPerUser ?? settings.maxActivePredictionsPerUser,
                updatedByUserId,
                updatedAt: now,
            }).where(eq(callItSettings.id, CALL_IT_SETTINGS_ID)).returning();
            if (!updated) throw new Error('Settings update returned no row');
            await this.publishSettingsChanged();
            return ok(this.toSettingsView(updated));
        } catch (error) {
            logger.error('failed to update settings', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Call-it-Einstellungen konnten nicht gespeichert werden.' });
        }
    }

    private async activePredictionCounts(): Promise<Record<string, number>> {
        const rows = await this.db.select({
            trackerId: callItPrediction.trackerId,
            count: sql<number>`count(*)`,
        }).from(callItPrediction)
            .where(eq(callItPrediction.status, 'ACTIVE'))
            .groupBy(callItPrediction.trackerId);
        return Object.fromEntries(rows.map((row) => [row.trackerId, Number(row.count)]));
    }

    async listActiveTrackers(): Promise<Result<CallItTrackerListItem[], InternalError>> {
        try {
            const [trackers, counts] = await Promise.all([
                this.db.select().from(callItTracker)
                    .where(eq(callItTracker.isActive, true))
                    .orderBy(asc(callItTracker.symbol)),
                this.activePredictionCounts(),
            ]);
            return ok(trackers.map((tracker) => ({
                ...toTrackerSummary(tracker),
                activePredictionCount: counts[tracker.id] ?? 0,
            })));
        } catch (error) {
            logger.error('failed to list trackers', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Tracker konnten nicht geladen werden.' });
        }
    }

    async listActiveTrackersWithHistory(
        historyDays = 7,
    ): Promise<Result<CallItTrackerOverviewItem[], BadRequestError | InternalError>> {
        if (!Number.isInteger(historyDays) || historyDays < 1 || historyDays > CALL_IT_MAX_HISTORY_DAYS) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Verlaufszeitraum ist ungültig.' });
        }
        try {
            const [trackers, counts] = await Promise.all([
                this.db.select().from(callItTracker)
                    .where(eq(callItTracker.isActive, true))
                    .orderBy(asc(callItTracker.symbol)),
                this.activePredictionCounts(),
            ]);
            if (trackers.length === 0) return ok([]);

            const now = this.clock();
            const from = new Date(now.getTime() - historyDays * DAY_MS);
            const interval = intervalForHistoryDays(historyDays);
            const historyRows = await this.db.select({
                trackerId: callItPriceCandle.trackerId,
                ts: callItPriceCandle.ts,
                open: callItPriceCandle.open,
                high: callItPriceCandle.high,
                low: callItPriceCandle.low,
                close: callItPriceCandle.close,
            }).from(callItPriceCandle)
                .where(and(
                    inArray(callItPriceCandle.trackerId, trackers.map((tracker) => tracker.id)),
                    eq(callItPriceCandle.interval, interval),
                    gte(callItPriceCandle.ts, from),
                ))
                .orderBy(asc(callItPriceCandle.ts));

            const historyByTracker = new Map<string, CallItHistoryPoint[]>();
            for (const row of historyRows) {
                const points = historyByTracker.get(row.trackerId) ?? [];
                points.push({
                    observedAt: row.ts,
                    open: row.open,
                    high: row.high,
                    low: row.low,
                    close: row.close,
                });
                historyByTracker.set(row.trackerId, points);
            }

            return ok(trackers.map((tracker) => ({
                ...toTrackerSummary(tracker),
                activePredictionCount: counts[tracker.id] ?? 0,
                history: downsampleHistory(historyByTracker.get(tracker.id) ?? [], 120),
            })));
        } catch (error) {
            logger.error('failed to list trackers with history', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Tracker konnten nicht geladen werden.' });
        }
    }

    async listAllTrackersForAdmin(): Promise<Result<CallItTrackerListItem[], InternalError>> {
        try {
            const [trackers, counts] = await Promise.all([
                this.db.select().from(callItTracker).orderBy(asc(callItTracker.symbol)),
                this.activePredictionCounts(),
            ]);
            return ok(trackers.map((tracker) => ({
                ...toTrackerSummary(tracker),
                activePredictionCount: counts[tracker.id] ?? 0,
            })));
        } catch (error) {
            logger.error('failed to list admin trackers', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Tracker konnten nicht geladen werden.' });
        }
    }

    private async upsertCandles(
        trackerId: string,
        interval: CallItCandleInterval,
        candles: MarketCandle[],
    ): Promise<void> {
        for (const batch of chunks(candles, CANDLE_CHUNK_SIZE)) {
            if (batch.length === 0) continue;
            await this.db.insert(callItPriceCandle).values(batch.map((candle) => ({
                trackerId,
                interval,
                ts: candle.ts,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
            }))).onConflictDoUpdate({
                target: [callItPriceCandle.trackerId, callItPriceCandle.interval, callItPriceCandle.ts],
                set: {
                    open: sql`excluded.open`,
                    high: sql`excluded.high`,
                    low: sql`excluded.low`,
                    close: sql`excluded.close`,
                    volume: sql`excluded.volume`,
                },
            });
        }
    }

    private async refreshTrackerCandles(
        tracker: CallItTracker,
        now: Date,
        intervals: readonly CallItCandleInterval[] = CANDLE_INTERVALS,
    ): Promise<void> {
        for (const interval of intervals) {
            try {
                const [latest] = await this.db.select({ ts: callItPriceCandle.ts })
                    .from(callItPriceCandle)
                    .where(and(
                        eq(callItPriceCandle.trackerId, tracker.id),
                        eq(callItPriceCandle.interval, interval),
                    ))
                    .orderBy(desc(callItPriceCandle.ts))
                    .limit(1);
                const lookbackStart = interval === '15m'
                    ? new Date(now.getTime() - FIFTEEN_MINUTE_LOOKBACK_DAYS * DAY_MS)
                    : interval === '1h'
                        ? new Date(now.getTime() - HOURLY_LOOKBACK_DAYS * DAY_MS)
                        : DAILY_HISTORY_START;
                const from = latest
                    ? new Date(Math.max(
                        latest.ts.getTime() - CANDLE_INTERVAL_MS[interval],
                        lookbackStart.getTime(),
                    ))
                    : lookbackStart;
                if (from.getTime() >= now.getTime()) continue;

                const history = await this.marketData.fetchHistory(tracker.symbol, {
                    from,
                    to: now,
                    interval,
                });
                if (!history.ok) {
                    logger.warn('tracker candle refresh failed', {
                        symbol: tracker.symbol,
                        interval,
                        error: history.error.message,
                    });
                    continue;
                }
                await this.upsertCandles(tracker.id, interval, history.value);
            } catch (error) {
                logger.warn('tracker candle refresh failed', {
                    symbol: tracker.symbol,
                    interval,
                    error: String(error),
                });
            }
        }
    }

    private dueCandleIntervals(now: Date): CallItCandleInterval[] {
        return CANDLE_INTERVALS.filter((interval) => {
            const lastRefresh = this.lastCandleRefreshAt.get(interval);
            return !lastRefresh
                || now.getTime() - lastRefresh.getTime() >= CANDLE_REFRESH_INTERVALS_MS[interval];
        });
    }

    private async refreshCandlesForTrackers(trackers: CallItTracker[], now: Date): Promise<void> {
        const intervals = this.dueCandleIntervals(now);
        if (intervals.length === 0) return;
        for (const interval of intervals) {
            this.lastCandleRefreshAt.set(interval, now);
        }
        for (const tracker of trackers) {
            await this.refreshTrackerCandles(tracker, now, intervals);
        }
    }

    private async cleanupOldCandles(now: Date): Promise<void> {
        if (this.lastCandleCleanupAt
            && now.getTime() - this.lastCandleCleanupAt.getTime() < CANDLE_CLEANUP_INTERVAL_MS) {
            return;
        }
        this.lastCandleCleanupAt = now;
        try {
            await this.db.delete(callItPriceCandle).where(and(
                eq(callItPriceCandle.interval, '15m'),
                lt(callItPriceCandle.ts, new Date(now.getTime() - FIFTEEN_MINUTE_RETENTION_DAYS * DAY_MS)),
            ));
            await this.db.delete(callItPriceCandle).where(and(
                eq(callItPriceCandle.interval, '1h'),
                lt(callItPriceCandle.ts, new Date(now.getTime() - HOURLY_RETENTION_DAYS * DAY_MS)),
            ));
        } catch (error) {
            logger.warn('callit candle cleanup failed', { error: String(error) });
        }
    }

    async addTracker(
        createdByUserId: string,
        input: { symbol: string; name?: string | null },
    ): Promise<Result<{ tracker: CallItTrackerListItem; created: boolean }, CallItError>> {
        const symbol = normalizeSymbol(typeof input.symbol === 'string' ? input.symbol : '');
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!SYMBOL_PATTERN.test(symbol)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Das Symbol ist ungültig.' });
        }
        if (name.length > 80) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Name darf höchstens 80 Zeichen lang sein.' });
        }

        const quoteResult = await this.marketData.fetchQuote(symbol);
        if (!quoteResult.ok) return err(quoteResult.error);
        const quote = quoteResult.value;
        if (!quote) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Für dieses Symbol wurden keine Kursdaten gefunden.' });
        }

        const now = this.clock();
        const displayName = name || quote.name || symbol;
        const currency = quote.currency;

        try {
            const [existing] = await this.db.select().from(callItTracker)
                .where(eq(callItTracker.symbol, symbol)).limit(1);
            if (existing) {
                if (existing.isActive) {
                    return err({ status: 409, code: 'CONFLICT', message: 'Dieser Tracker ist bereits aktiv.' });
                }
                const discussion = existing.discussionId
                    ? ok({ id: existing.discussionId })
                    : await this.discussions.getOrCreateDiscussion(CALL_IT_DISCUSSION_TARGET_TYPE, existing.id);
                if (!discussion.ok) return err(discussion.error);

                const [updated] = await this.db.update(callItTracker).set({
                    name: displayName,
                    currency: currency ?? existing.currency,
                    isActive: true,
                    lastPrice: quote.price,
                    lastPriceAt: now,
                    discussionId: discussion.value.id,
                    updatedAt: now,
                }).where(eq(callItTracker.id, existing.id)).returning();
                if (!updated) throw new Error('Tracker reactivation returned no row');
                await this.refreshTrackerCandles(updated, now);
                const counts = await this.activePredictionCounts();
                await this.publishTrackerChanged(updated.id, 'CREATED');
                return ok({
                    tracker: { ...toTrackerSummary(updated), activePredictionCount: counts[updated.id] ?? 0 },
                    created: false,
                });
            }
        } catch (error) {
            logger.error('failed to check existing tracker', { symbol, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Tracker konnte nicht gespeichert werden.' });
        }

        const trackerId = randomUUID();
        const discussionResult = await this.discussions.getOrCreateDiscussion(CALL_IT_DISCUSSION_TARGET_TYPE, trackerId);
        if (!discussionResult.ok) return err(discussionResult.error);

        try {
            const tracker: CallItTracker = {
                id: trackerId,
                symbol,
                name: displayName,
                currency,
                isActive: true,
                lastPrice: quote.price,
                lastPriceAt: now,
                discussionId: discussionResult.value.id,
                createdByUserId,
                createdAt: now,
                updatedAt: now,
            };
            await this.db.transaction(async (tx) => {
                await tx.insert(callItTracker).values(tracker);
            });
            await this.refreshTrackerCandles(tracker, now);
            await this.publishTrackerChanged(trackerId, 'CREATED');
            return ok({ tracker: { ...toTrackerSummary(tracker), activePredictionCount: 0 }, created: true });
        } catch (error) {
            await this.discussions.deleteDiscussion(discussionResult.value.id);
            logger.error('failed to create tracker', { symbol, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Tracker konnte nicht gespeichert werden.' });
        }
    }

    async previewTracker(symbol: string): Promise<Result<CallItTrackerPreview, CallItError>> {
        const normalized = normalizeSymbol(typeof symbol === 'string' ? symbol : '');
        if (!SYMBOL_PATTERN.test(normalized)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Das Symbol ist ungültig.' });
        }

        const quoteResult = await this.marketData.fetchQuote(normalized);
        if (!quoteResult.ok) return err(quoteResult.error);
        const quote = quoteResult.value;
        if (!quote) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Für dieses Symbol wurden keine Kursdaten gefunden.' });
        }

        try {
            const [existing] = await this.db.select({
                id: callItTracker.id,
                isActive: callItTracker.isActive,
            }).from(callItTracker).where(eq(callItTracker.symbol, normalized)).limit(1);

            const now = this.clock();
            const historyResult = await this.marketData.fetchHistory(normalized, {
                from: new Date(now.getTime() - 30 * DAY_MS),
                to: now,
                interval: '1d',
            });

            return ok({
                symbol: normalized,
                name: quote.name,
                currency: quote.currency,
                price: quote.price,
                marketTime: quote.marketTime,
                marketState: quote.marketState,
                history: historyResult.ok
                    ? downsampleHistory(historyResult.value.map((point) => ({
                        observedAt: point.ts,
                        open: point.open,
                        high: point.high,
                        low: point.low,
                        close: point.close,
                    })), 120)
                    : [],
                existingTracker: existing ?? null,
            });
        } catch (error) {
            logger.error('failed to preview tracker', { symbol: normalized, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Das Symbol konnte nicht geprüft werden.' });
        }
    }

    async fullyRemoveTracker(trackerId: string): Promise<Result<null, CallItError>> {
        if (!validId(trackerId)) return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Tracker-ID.' });
        try {
            const [tracker] = await this.db.select().from(callItTracker)
                .where(eq(callItTracker.id, trackerId)).limit(1);
            if (!tracker) return err({ status: 404, code: 'NOT_FOUND', message: 'Tracker nicht gefunden.' });

            const predictions = await this.db.select({
                id: callItPrediction.id,
                userId: callItPrediction.userId,
            }).from(callItPrediction).where(eq(callItPrediction.trackerId, trackerId));

            if (this.reactions) {
                for (const prediction of predictions) {
                    try {
                        await this.reactions.deleteTargetReactions(CALL_IT_REACTION_TARGET_TYPE, prediction.id);
                    } catch (error) {
                        logger.warn('failed to delete prediction reactions during tracker removal', {
                            predictionId: prediction.id,
                            error: String(error),
                        });
                    }
                }
            }

            await this.db.transaction(async (tx) => {
                await tx.delete(callItPrediction).where(eq(callItPrediction.trackerId, trackerId));
                await tx.delete(callItTracker).where(eq(callItTracker.id, trackerId));
            });

            if (tracker.discussionId) {
                const deleted = await this.discussions.deleteDiscussion(tracker.discussionId);
                if (!deleted.ok) {
                    logger.warn('tracker discussion cleanup failed', { trackerId, error: deleted.error.message });
                }
            }

            for (const prediction of predictions) {
                await this.publishPredictionChanged(prediction.id, 'DELETED');
            }
            for (const userId of new Set(predictions.map((prediction) => prediction.userId))) {
                await this.publishUserStatsChanged(userId);
            }
            await this.publishTrackerChanged(trackerId, 'DELETED');
            return ok(null);
        } catch (error) {
            logger.error('failed to fully remove tracker', { trackerId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Tracker konnte nicht vollständig entfernt werden.' });
        }
    }

    async removeTracker(trackerId: string): Promise<Result<null, CallItError>> {
        if (!validId(trackerId)) return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Tracker-ID.' });
        try {
            const [tracker] = await this.db.select().from(callItTracker)
                .where(eq(callItTracker.id, trackerId)).limit(1);
            if (!tracker) return err({ status: 404, code: 'NOT_FOUND', message: 'Tracker nicht gefunden.' });
            if (!tracker.isActive) return ok(null);

            await this.db.update(callItTracker).set({
                isActive: false,
                updatedAt: this.clock(),
            }).where(eq(callItTracker.id, trackerId));
            await this.publishTrackerChanged(trackerId, 'DELETED');
            return ok(null);
        } catch (error) {
            logger.error('failed to remove tracker', { trackerId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Tracker konnte nicht entfernt werden.' });
        }
    }

    private async reactionData(ids: string[]): Promise<{
        counts: Record<string, number>;
        emojis: Record<string, string>;
    }> {
        if (!this.reactions || ids.length === 0) return { counts: {}, emojis: {} };
        try {
            const [counts, emojis] = await Promise.all([
                this.reactions.getCounts(CALL_IT_REACTION_TARGET_TYPE, ids),
                this.reactions.getRandomReactionEmojis(CALL_IT_REACTION_TARGET_TYPE, ids),
            ]);
            return { counts, emojis };
        } catch (error) {
            logger.warn('failed to load prediction reactions', { error: String(error) });
            return { counts: {}, emojis: {} };
        }
    }

    private toPredictionSummary(
        row: PredictionJoinRow,
        reactionCount: number,
        reactionEmoji: string | null,
    ): CallItPredictionSummary {
        const currentPrice = row.tracker.lastPrice;
        const unrealizedProfitLoss = row.prediction.status === 'ACTIVE' && currentPrice !== null && currentPrice > 0
            ? computeProfit(row.prediction.wager, row.prediction.direction, row.prediction.startPrice, currentPrice).profitLoss
            : null;
        return {
            id: row.prediction.id,
            user: row.user,
            tracker: toTrackerSummary(row.tracker),
            direction: row.prediction.direction,
            durationKey: row.prediction.durationKey,
            wager: row.prediction.wager,
            startPrice: row.prediction.startPrice,
            startAt: row.prediction.startAt,
            endsAt: row.prediction.endsAt,
            status: row.prediction.status,
            endPrice: row.prediction.endPrice,
            resolvedAt: row.prediction.resolvedAt,
            profitLoss: row.prediction.profitLoss,
            priceChangePercent: row.prediction.priceChangePercent,
            currentPrice,
            currentPriceAt: row.tracker.lastPriceAt,
            unrealizedProfitLoss,
            reactionCount,
            reactionEmoji,
        };
    }

    private async toPredictionSummaries(rows: PredictionJoinRow[]): Promise<CallItPredictionSummary[]> {
        const { counts, emojis } = await this.reactionData(rows.map((row) => row.prediction.id));
        return rows.map((row) => this.toPredictionSummary(
            row,
            counts[row.prediction.id] ?? 0,
            emojis[row.prediction.id] ?? null,
        ));
    }

    private async loadPredictionJoin(predictionId: string): Promise<PredictionJoinRow | null> {
        const [row] = await this.db.select({
            prediction: callItPrediction,
            tracker: callItTracker,
            user: { id: user.id, name: user.name, image: user.image },
        }).from(callItPrediction)
            .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId))
            .innerJoin(user, eq(user.id, callItPrediction.userId))
            .where(eq(callItPrediction.id, predictionId))
            .limit(1);
        return row ?? null;
    }

    private async resolveStartPrice(
        tracker: CallItTracker,
        settings: typeof callItSettings.$inferSelect,
        now: Date,
    ): Promise<Result<{
        price: number;
        currency: string | null;
        fetched: boolean;
    }, CallItError>> {
        const maxAgeMs = Math.max(settings.updateIntervalMinutes * 2, 30) * 60 * 1000;
        if (tracker.lastPrice !== null
            && tracker.lastPrice > 0
            && tracker.lastPriceAt
            && now.getTime() - tracker.lastPriceAt.getTime() <= maxAgeMs) {
            return ok({
                price: tracker.lastPrice,
                currency: tracker.currency,
                fetched: false,
            });
        }

        const quoteResult = await this.marketData.fetchQuote(tracker.symbol);
        if (!quoteResult.ok) return err(quoteResult.error);
        if (!quoteResult.value) {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Für diesen Tracker ist aktuell kein Kurs verfügbar.' });
        }
        return ok({
            price: quoteResult.value.price,
            currency: quoteResult.value.currency ?? tracker.currency,
            fetched: true,
        });
    }

    async createPrediction(
        userId: string,
        input: CreatePredictionInput,
    ): Promise<Result<CallItPredictionSummary & { created: boolean }, CallItError>> {
        if (!validId(userId) || !validId(input.trackerId)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Die Vorhersagedaten sind ungültig.' });
        }
        if (input.id !== undefined && !validId(input.id)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Die Vorhersage-ID ist ungültig.' });
        }
        if (!isDirection(input.direction) || !isDurationKey(input.durationKey) || !isWager(input.wager)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Richtung, Laufzeit oder Einsatz sind ungültig.' });
        }

        try {
            if (input.id) {
                const existing = await this.loadPredictionJoin(input.id);
                if (existing) {
                    const prediction = existing.prediction;
                    const sameRequest = prediction.userId === userId
                        && prediction.trackerId === input.trackerId
                        && prediction.direction === input.direction
                        && prediction.durationKey === input.durationKey
                        && prediction.wager === input.wager;
                    if (!sameRequest) {
                        return err({ status: 409, code: 'CONFLICT', message: 'Diese Vorhersage-ID ist bereits vergeben.' });
                    }
                    const [summary] = await this.toPredictionSummaries([existing]);
                    if (!summary) throw new Error('Existing prediction could not be summarized');
                    return ok({ ...summary, created: false });
                }
            }

            const [tracker] = await this.db.select().from(callItTracker)
                .where(eq(callItTracker.id, input.trackerId)).limit(1);
            if (!tracker) return err({ status: 404, code: 'NOT_FOUND', message: 'Tracker nicht gefunden.' });
            if (!tracker.isActive) {
                return err({ status: 400, code: 'BAD_REQUEST', message: 'Auf diesen Tracker können keine neuen Vorhersagen platziert werden.' });
            }

            const settings = await this.ensureSettings();
            const now = this.clock();
            const start = await this.resolveStartPrice(tracker, settings, now);
            if (!start.ok) return err(start.error);

            const predictionId = input.id ?? randomUUID();
            const endsAt = new Date(now.getTime() + DURATION_DAYS[input.durationKey] * 24 * 60 * 60 * 1000);
            const prediction: CallItPrediction = {
                id: predictionId,
                userId,
                trackerId: tracker.id,
                direction: input.direction,
                durationKey: input.durationKey,
                wager: input.wager,
                startPrice: start.value.price,
                startAt: now,
                endsAt,
                status: 'ACTIVE',
                endPrice: null,
                resolvedAt: null,
                profitLoss: null,
                priceChangePercent: null,
                createdAt: now,
            };

            const created = await this.db.transaction(async (tx) => {
                const active = await tx.select({ id: callItPrediction.id })
                    .from(callItPrediction)
                    .where(and(
                        eq(callItPrediction.userId, userId),
                        eq(callItPrediction.status, 'ACTIVE'),
                    ));
                if (active.length >= settings.maxActivePredictionsPerUser) {
                    return { kind: 'limit' as const };
                }
                await tx.insert(callItPrediction).values(prediction);
                if (start.value.fetched) {
                    await tx.update(callItTracker).set({
                        lastPrice: start.value.price,
                        lastPriceAt: now,
                        currency: start.value.currency ?? tracker.currency,
                        updatedAt: now,
                    }).where(eq(callItTracker.id, tracker.id));
                }
                return { kind: 'created' as const };
            });

            if (created.kind === 'limit') {
                return err({
                    status: 409,
                    code: 'CONFLICT',
                    message: `Du hast bereits die maximale Anzahl von ${settings.maxActivePredictionsPerUser} gleichzeitigen Vorhersagen erreicht.`,
                });
            }

            const row = await this.loadPredictionJoin(predictionId);
            if (!row) throw new Error('Created prediction could not be loaded');
            const [summary] = await this.toPredictionSummaries([row]);
            if (!summary) throw new Error('Created prediction could not be summarized');

            const recorded = await this.activityFeed.recordActivity({
                type: 'callit.prediction.created',
                actorUserId: userId,
                target: { type: 'callit.prediction', id: predictionId },
                discussionId: tracker.discussionId,
                data: {
                    trackerId: tracker.id,
                    trackerSymbol: tracker.symbol,
                    direction: prediction.direction,
                },
                occurredAt: prediction.createdAt,
            });
            if (!recorded.ok) return err(recorded.error);
            await this.notifications.notifyAll('callit.prediction.new', [userId], {
                title: 'Neue Vorhersage',
                body: `${summary.user.name}: ${tracker.symbol} ${directionLabel(prediction.direction)} (${prediction.wager} €)`.slice(0, 240),
                url: `/callit/trackers/${encodeURIComponent(tracker.id)}`,
            });

            await this.publishPredictionChanged(predictionId, 'CREATED');
            await this.publishUserStatsChanged(userId);
            await this.publishTrackerChanged(tracker.id, 'UPDATED');
            return ok({ ...summary, created: true });
        } catch (error) {
            logger.error('failed to create prediction', { userId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Vorhersage konnte nicht erstellt werden.' });
        }
    }

    async getOverview(viewerUserId: string): Promise<Result<CallItOverview, InternalError>> {
        try {
            const settings = await this.ensureSettings();
            const activeRows = await this.db.select({
                prediction: callItPrediction,
                tracker: callItTracker,
                user: { id: user.id, name: user.name, image: user.image },
            }).from(callItPrediction)
                .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId))
                .innerJoin(user, eq(user.id, callItPrediction.userId))
                .where(eq(callItPrediction.status, 'ACTIVE'))
                .orderBy(asc(callItPrediction.endsAt), asc(callItPrediction.createdAt));
            const activeSummaries = await this.toPredictionSummaries(activeRows);

            const myPredictionRows = await this.db.select({
                prediction: callItPrediction,
                currentPrice: callItTracker.lastPrice,
            }).from(callItPrediction)
                .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId))
                .where(eq(callItPrediction.userId, viewerUserId));
            const myPredictions: StatsInput[] = myPredictionRows.map((row) => ({
                ...row.prediction,
                currentPrice: row.currentPrice,
            }));

            const leaderboardRows = await this.db.select({
                userId: user.id,
                name: user.name,
                image: user.image,
                status: callItPrediction.status,
                wager: callItPrediction.wager,
                direction: callItPrediction.direction,
                startPrice: callItPrediction.startPrice,
                profitLoss: callItPrediction.profitLoss,
                currentPrice: callItTracker.lastPrice,
            }).from(callItPrediction)
                .innerJoin(user, eq(user.id, callItPrediction.userId))
                .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId));

            const leaderboardUsers = new Map<string, {
                user: CallItUserSummary;
                completedProfit: number;
                unrealizedProfit: number;
                activeCount: number;
                completedCount: number;
                wins: number;
                losses: number;
            }>();
            for (const row of leaderboardRows) {
                const entry = leaderboardUsers.get(row.userId) ?? {
                    user: { id: row.userId, name: row.name, image: row.image },
                    completedProfit: 0,
                    unrealizedProfit: 0,
                    activeCount: 0,
                    completedCount: 0,
                    wins: 0,
                    losses: 0,
                };
                if (row.status === 'ACTIVE') {
                    entry.activeCount += 1;
                    if (row.currentPrice !== null && row.currentPrice > 0) {
                        entry.unrealizedProfit += computeProfit(
                            row.wager,
                            row.direction,
                            row.startPrice,
                            row.currentPrice,
                        ).profitLoss;
                    }
                } else {
                    entry.completedCount += 1;
                    const profit = row.profitLoss ?? 0;
                    entry.completedProfit += profit;
                    if (profit > 0) entry.wins += 1;
                    else if (profit < 0) entry.losses += 1;
                }
                leaderboardUsers.set(row.userId, entry);
            }

            const leaderboard = [...leaderboardUsers.values()]
                .map((entry) => ({
                    ...entry,
                    allTimeProfit: entry.completedProfit + entry.unrealizedProfit,
                }))
                .sort((a, b) => b.allTimeProfit - a.allTimeProfit
                    || b.completedCount - a.completedCount
                    || a.user.name.localeCompare(b.user.name))
                .map((entry, index) => ({
                    rank: index + 1,
                    user: entry.user,
                    allTimeProfit: entry.allTimeProfit,
                    unrealizedProfit: entry.unrealizedProfit,
                    activeCount: entry.activeCount,
                    completedCount: entry.completedCount,
                    wins: entry.wins,
                    losses: entry.losses,
                }));

            return ok({
                myStats: computeStats(myPredictions),
                limits: { maxActivePredictionsPerUser: settings.maxActivePredictionsPerUser },
                myActivePredictions: activeSummaries.filter((prediction) => prediction.user.id === viewerUserId),
                otherActivePredictions: activeSummaries.filter((prediction) => prediction.user.id !== viewerUserId),
                leaderboard,
            });
        } catch (error) {
            logger.error('failed to load overview', { viewerUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Call it konnte nicht geladen werden.' });
        }
    }

    async getUserPage(
        _viewerUserId: string,
        targetUserId: string,
    ): Promise<Result<CallItUserPage, CallItError>> {
        if (!validId(targetUserId)) return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Benutzer-ID.' });
        try {
            const [targetUser] = await this.db.select({ id: user.id, name: user.name, image: user.image })
                .from(user).where(eq(user.id, targetUserId)).limit(1);
            if (!targetUser) return err({ status: 404, code: 'NOT_FOUND', message: 'Benutzer nicht gefunden.' });

            const settings = await this.ensureSettings();
            const rows = await this.db.select({
                prediction: callItPrediction,
                tracker: callItTracker,
            }).from(callItPrediction)
                .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId))
                .where(eq(callItPrediction.userId, targetUserId));

            const activeRows: PredictionJoinRow[] = rows
                .filter((row) => row.prediction.status === 'ACTIVE')
                .sort((a, b) => a.prediction.endsAt.getTime() - b.prediction.endsAt.getTime())
                .slice(0, MAX_COMPLETED_PREDICTIONS)
                .map((row) => ({ ...row, user: toUserSummary(targetUser) }));
            const completedRows: PredictionJoinRow[] = rows
                .filter((row) => row.prediction.status === 'COMPLETED')
                .sort((a, b) => (b.prediction.resolvedAt?.getTime() ?? 0) - (a.prediction.resolvedAt?.getTime() ?? 0))
                .slice(0, MAX_COMPLETED_PREDICTIONS)
                .map((row) => ({ ...row, user: toUserSummary(targetUser) }));

            const [activePredictions, completedPredictions] = await Promise.all([
                this.toPredictionSummaries(activeRows),
                this.toPredictionSummaries(completedRows),
            ]);

            return ok({
                user: toUserSummary(targetUser),
                stats: computeStats(rows.map((row) => ({
                    ...row.prediction,
                    currentPrice: row.tracker.lastPrice,
                }))),
                limits: { maxActivePredictionsPerUser: settings.maxActivePredictionsPerUser },
                activePredictions,
                completedPredictions,
            });
        } catch (error) {
            logger.error('failed to load user page', { targetUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Vorhersagen konnten nicht geladen werden.' });
        }
    }

    async getTrackerDetail(
        _viewerUserId: string,
        trackerId: string,
        options: { historyDays?: number } = {},
    ): Promise<Result<CallItTrackerDetail, CallItError>> {
        if (!validId(trackerId)) return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Tracker-ID.' });
        const historyDays = options.historyDays ?? 30;
        if (!Number.isInteger(historyDays) || historyDays < 1 || historyDays > CALL_IT_MAX_HISTORY_DAYS) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Verlaufszeitraum ist ungültig.' });
        }

        try {
            const [tracker] = await this.db.select().from(callItTracker)
                .where(eq(callItTracker.id, trackerId)).limit(1);
            if (!tracker) return err({ status: 404, code: 'NOT_FOUND', message: 'Tracker nicht gefunden.' });

            const now = this.clock();
            const from = new Date(now.getTime() - historyDays * DAY_MS);
            const interval = intervalForHistoryDays(historyDays);
            const historyRows = await this.db.select({
                ts: callItPriceCandle.ts,
                open: callItPriceCandle.open,
                high: callItPriceCandle.high,
                low: callItPriceCandle.low,
                close: callItPriceCandle.close,
            }).from(callItPriceCandle)
                .where(and(
                    eq(callItPriceCandle.trackerId, trackerId),
                    eq(callItPriceCandle.interval, interval),
                    gte(callItPriceCandle.ts, from),
                ))
                .orderBy(asc(callItPriceCandle.ts));

            const activeRows = await this.db.select({
                prediction: callItPrediction,
                tracker: callItTracker,
                user: { id: user.id, name: user.name, image: user.image },
            }).from(callItPrediction)
                .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId))
                .innerJoin(user, eq(user.id, callItPrediction.userId))
                .where(and(
                    eq(callItPrediction.trackerId, trackerId),
                    eq(callItPrediction.status, 'ACTIVE'),
                ))
                .orderBy(asc(callItPrediction.endsAt));

            const completedRows = await this.db.select({
                prediction: callItPrediction,
                tracker: callItTracker,
                user: { id: user.id, name: user.name, image: user.image },
            }).from(callItPrediction)
                .innerJoin(callItTracker, eq(callItTracker.id, callItPrediction.trackerId))
                .innerJoin(user, eq(user.id, callItPrediction.userId))
                .where(and(
                    eq(callItPrediction.trackerId, trackerId),
                    eq(callItPrediction.status, 'COMPLETED'),
                ))
                .orderBy(desc(callItPrediction.resolvedAt))
                .limit(MAX_TRACKER_COMPLETED_PREDICTIONS);

            const [activePredictions, completedPredictions] = await Promise.all([
                this.toPredictionSummaries(activeRows),
                this.toPredictionSummaries(completedRows),
            ]);

            let commentCount = 0;
            if (tracker.discussionId) {
                const counts = await this.discussions.getMessageCounts([tracker.discussionId]);
                commentCount = counts[tracker.discussionId] ?? 0;
            }

            return ok({
                tracker: toTrackerSummary(tracker),
                commentCount,
                history: downsampleHistory(historyRows.map((row) => ({
                    observedAt: row.ts,
                    open: row.open,
                    high: row.high,
                    low: row.low,
                    close: row.close,
                }))),
                activePredictions,
                completedPredictions,
            });
        } catch (error) {
            logger.error('failed to load tracker detail', { trackerId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Tracker konnte nicht geladen werden.' });
        }
    }

    async canViewPrediction(_viewerUserId: string, predictionId: string): Promise<boolean> {
        if (!validId(predictionId)) return false;
        try {
            const [row] = await this.db.select({ id: callItPrediction.id })
                .from(callItPrediction).where(eq(callItPrediction.id, predictionId)).limit(1);
            return Boolean(row);
        } catch {
            return false;
        }
    }

    async canViewTracker(_viewerUserId: string, trackerId: string): Promise<boolean> {
        if (!validId(trackerId)) return false;
        try {
            const [row] = await this.db.select({ id: callItTracker.id })
                .from(callItTracker).where(eq(callItTracker.id, trackerId)).limit(1);
            return Boolean(row);
        } catch {
            return false;
        }
    }

    async syncPrices(): Promise<Result<CallItSyncResult, InternalError>> {
        const now = this.clock();
        const errors: string[] = [];
        let trackersUpdated = 0;
        let predictionsResolved = 0;

        try {
            const settings = await this.ensureSettings();
            await this.cleanupOldCandles(now);
            const allTrackers = await this.db.select().from(callItTracker);
            const activeTrackerRows = await this.db.selectDistinct({ trackerId: callItPrediction.trackerId })
                .from(callItPrediction)
                .where(eq(callItPrediction.status, 'ACTIVE'));
            const activeTrackerIds = new Set(activeTrackerRows.map((row) => row.trackerId));
            const trackers = allTrackers.filter((tracker) => tracker.isActive || activeTrackerIds.has(tracker.id));

            if (trackers.length === 0) {
                await this.db.update(callItSettings).set({
                    lastSyncAt: now,
                    lastSyncError: null,
                    updatedAt: now,
                }).where(eq(callItSettings.id, CALL_IT_SETTINGS_ID));
                await this.publishSettingsChanged();
                return ok({ trackersUpdated: 0, predictionsResolved: 0, errors: [] });
            }

            const quotesResult = await this.marketData.fetchQuotes(trackers.map((tracker) => tracker.symbol));
            if (!quotesResult.ok) {
                await this.recordSyncError(now, quotesResult.error.message);
                return err(quotesResult.error);
            }

            const quotes = new Map(quotesResult.value.map((quote) => [quote.symbol, quote]));
            const syncedTrackers: Array<{
                tracker: CallItTracker;
                resolved: Array<{ id: string; userId: string; direction: CallItDirection; profitLoss: number }>;
            }> = [];
            for (const tracker of trackers) {
                const quote: MarketQuote | undefined = quotes.get(tracker.symbol);
                if (!quote) {
                    errors.push(`${tracker.symbol}: kein Kurs verfügbar`);
                    continue;
                }

                try {
                    const resolved = await this.syncTracker(tracker, quote, now);
                    trackersUpdated += 1;
                    predictionsResolved += resolved.length;
                    syncedTrackers.push({ tracker, resolved });
                } catch (error) {
                    errors.push(`${tracker.symbol}: Synchronisierung fehlgeschlagen`);
                    logger.error('tracker sync failed', { trackerId: tracker.id, symbol: tracker.symbol, error: String(error) });
                }
            }

            // Refresh candles before announcing tracker changes so clients refetch fresh history.
            await this.refreshCandlesForTrackers(trackers, now);

            for (const { tracker, resolved } of syncedTrackers) {
                await this.publishTrackerChanged(tracker.id, 'UPDATED');
                for (const prediction of resolved) {
                    await this.publishPredictionChanged(prediction.id, 'UPDATED');
                    await this.publishUserStatsChanged(prediction.userId);
                }
                await this.announceResolvedPredictions(tracker, resolved, now);
            }

            const errorMessage = errors.length > 0
                ? errors.join('; ').slice(0, MAX_SYNC_ERROR_LENGTH)
                : null;
            await this.db.update(callItSettings).set({
                lastSyncAt: trackersUpdated > 0 ? now : settings.lastSyncAt,
                lastSyncError: errorMessage,
                updatedAt: now,
            }).where(eq(callItSettings.id, CALL_IT_SETTINGS_ID));
            if (errors.length > 0) await this.publishSettingsChanged();

            return ok({ trackersUpdated, predictionsResolved, errors });
        } catch (error) {
            logger.error('price sync failed', { error: String(error) });
            await this.recordSyncError(now, 'Synchronisierung fehlgeschlagen');
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Kurse konnten nicht synchronisiert werden.' });
        }
    }

    private async syncTracker(
        tracker: CallItTracker,
        quote: MarketQuote,
        now: Date,
    ): Promise<Array<{ id: string; userId: string; direction: CallItDirection; profitLoss: number }>> {
        return this.db.transaction(async (tx) => {
            await tx.update(callItTracker).set({
                lastPrice: quote.price,
                lastPriceAt: now,
                currency: quote.currency ?? tracker.currency,
                updatedAt: now,
            }).where(eq(callItTracker.id, tracker.id));

            const due = await tx.select().from(callItPrediction).where(and(
                eq(callItPrediction.trackerId, tracker.id),
                eq(callItPrediction.status, 'ACTIVE'),
                lte(callItPrediction.endsAt, now),
            ));
            const completed: Array<{ id: string; userId: string; direction: CallItDirection; profitLoss: number }> = [];
            for (const prediction of due) {
                const { profitLoss, priceChangePercent } = computeProfit(
                    prediction.wager,
                    prediction.direction,
                    prediction.startPrice,
                    quote.price,
                );
                const [updated] = await tx.update(callItPrediction).set({
                    status: 'COMPLETED',
                    endPrice: quote.price,
                    resolvedAt: now,
                    profitLoss,
                    priceChangePercent,
                }).where(and(
                    eq(callItPrediction.id, prediction.id),
                    eq(callItPrediction.status, 'ACTIVE'),
                )).returning({ id: callItPrediction.id });
                if (updated) {
                    completed.push({
                        id: prediction.id,
                        userId: prediction.userId,
                        direction: prediction.direction,
                        profitLoss,
                    });
                }
            }
            return completed;
        });
    }

    private async announceResolvedPredictions(
        tracker: CallItTracker,
        resolved: Array<{ id: string; userId: string; direction: CallItDirection; profitLoss: number }>,
        occurredAt: Date,
    ): Promise<void> {
        if (resolved.length === 0) return;

        let names = new Map<string, string>();
        try {
            const rows = await this.db.select({ id: user.id, name: user.name }).from(user)
                .where(inArray(user.id, [...new Set(resolved.map((prediction) => prediction.userId))]));
            names = new Map(rows.map((row) => [row.id, row.name]));
        } catch (error) {
            logger.warn('failed to load prediction owners for completion notifications', { error: String(error) });
        }

        for (const prediction of resolved) {
            try {
                const successful = prediction.profitLoss > 0;
                const recorded = await this.activityFeed.recordActivity({
                    type: 'callit.prediction.completed',
                    subjectUserId: prediction.userId,
                    target: { type: 'callit.prediction', id: prediction.id },
                    discussionId: tracker.discussionId,
                    data: {
                        trackerId: tracker.id,
                        trackerSymbol: tracker.symbol,
                        direction: prediction.direction,
                        successful,
                    },
                    occurredAt,
                });
                if (!recorded.ok) {
                    logger.warn('failed to record completed prediction activity', {
                        predictionId: prediction.id,
                        error: recorded.error.message,
                    });
                }

                const direction = directionLabel(prediction.direction);
                const result = successful ? 'erfolgreich' : 'nicht erfolgreich';
                const profit = `${prediction.profitLoss > 0 ? '+' : ''}${prediction.profitLoss} €`;
                await this.notifications.notifyUsers('callit.prediction.mine-completed', [prediction.userId], {
                    title: successful ? 'Vorhersage gewonnen' : 'Vorhersage abgeschlossen',
                    body: `${tracker.symbol} ${direction}: ${result} (${profit})`.slice(0, 240),
                    url: `/callit/users/${encodeURIComponent(prediction.userId)}`,
                });

                const ownerName = names.get(prediction.userId);
                await this.notifications.notifyAll('callit.prediction.completed', [prediction.userId], {
                    title: 'Vorhersage abgeschlossen',
                    body: `${ownerName ? `${ownerName}: ` : ''}${tracker.symbol} ${direction} – ${result}.`.slice(0, 240),
                    url: `/callit/trackers/${encodeURIComponent(tracker.id)}`,
                });
            } catch (error) {
                logger.warn('failed to announce resolved prediction', {
                    predictionId: prediction.id,
                    error: String(error),
                });
            }
        }
    }

    private async recordSyncError(now: Date, message: string): Promise<void> {
        try {
            await this.db.update(callItSettings).set({
                lastSyncError: message.slice(0, MAX_SYNC_ERROR_LENGTH),
                updatedAt: now,
            }).where(eq(callItSettings.id, CALL_IT_SETTINGS_ID));
            await this.publishSettingsChanged();
        } catch (error) {
            logger.warn('failed to record sync error', { error: String(error) });
        }
    }

    private async publishPredictionChanged(predictionId: string, action: CallItPredictionChangedEvent['action']): Promise<void> {
        await this.publish({
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'callit.prediction.changed',
            action,
            entityId: predictionId,
        });
    }

    private async publishUserStatsChanged(userId: string): Promise<void> {
        await this.publish({
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'callit.user-stats.changed',
            action: 'UPDATED',
            entityId: userId,
        });
    }

    private async publishTrackerChanged(trackerId: string, action: CallItTrackerChangedEvent['action']): Promise<void> {
        await this.publish({
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'callit.tracker.changed',
            action,
            entityId: trackerId,
        });
    }

    private async publishSettingsChanged(): Promise<void> {
        await this.publish({
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'callit.settings.changed',
            action: 'UPDATED',
            entityId: CALL_IT_SETTINGS_ID,
        });
    }

    private async publish(
        event: CallItPredictionChangedEvent | CallItUserStatsChangedEvent | CallItTrackerChangedEvent | CallItSettingsChangedEvent,
    ): Promise<void> {
        try {
            const result = await this.broadcast([RealtimeChannels.PUBLIC], event);
            if (!result.ok) logger.warn('callit event publication failed', { type: event.type, error: result.error.message });
        } catch (error) {
            logger.warn('callit event publication failed', { type: event.type, error: String(error) });
        }
    }
}

