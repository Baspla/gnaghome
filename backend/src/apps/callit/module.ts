import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { createAuthMiddleware } from '../../platform/auth';
import { createLogger } from '../../lib/logger';
import type { CallItPreferencesService } from './preferences';
import {
    CALL_IT_MAX_HISTORY_DAYS,
    type CallItOverview,
    type CallItHistoryPoint,
    type CallItPredictionSummary,
    type CallItService,
    type CallItSettingsView,
    type CallItTrackerDetail,
    type CallItTrackerListItem,
    type CallItTrackerOverviewItem,
    type CallItTrackerPreview,
    type CallItTrackerSummary,
    type CallItUserPage,
} from './service';

const logger = createLogger('callit');

type Service = Pick<
    CallItService,
    | 'getOverview'
    | 'getUserPage'
    | 'listActiveTrackers'
    | 'listActiveTrackersWithHistory'
    | 'getTrackerDetail'
    | 'createPrediction'
    | 'listAllTrackersForAdmin'
    | 'previewTracker'
    | 'addTracker'
    | 'removeTracker'
    | 'fullyRemoveTracker'
    | 'getSettings'
    | 'updateSettings'
>;

type RescheduleSync = (minutes: number) => Promise<void>;

type PreferencesService = Pick<CallItPreferencesService, 'getPreferences' | 'updatePreferences'>;

function serializeTracker(tracker: CallItTrackerSummary) {
    return {
        ...tracker,
        lastPriceAt: tracker.lastPriceAt?.toISOString() ?? null,
    };
}

function serializeTrackerListItem(tracker: CallItTrackerListItem) {
    return {
        ...serializeTracker(tracker),
        activePredictionCount: tracker.activePredictionCount,
    };
}

function serializeTrackerHistory(points: CallItHistoryPoint[]) {
    return points.map((point) => ({
        observedAt: point.observedAt.toISOString(),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
    }));
}

function serializeTrackerOverviewItem(tracker: CallItTrackerOverviewItem) {
    return {
        ...serializeTrackerListItem(tracker),
        history: serializeTrackerHistory(tracker.history),
    };
}

function serializeTrackerPreview(preview: CallItTrackerPreview) {
    return {
        ...preview,
        marketTime: preview.marketTime?.toISOString() ?? null,
        history: serializeTrackerHistory(preview.history),
    };
}

function serializePrediction(prediction: CallItPredictionSummary) {
    return {
        ...prediction,
        tracker: serializeTracker(prediction.tracker),
        startAt: prediction.startAt.toISOString(),
        endsAt: prediction.endsAt.toISOString(),
        resolvedAt: prediction.resolvedAt?.toISOString() ?? null,
        currentPriceAt: prediction.currentPriceAt?.toISOString() ?? null,
    };
}

function serializeOverview(overview: CallItOverview) {
    return {
        ...overview,
        myActivePredictions: overview.myActivePredictions.map(serializePrediction),
        otherActivePredictions: overview.otherActivePredictions.map(serializePrediction),
    };
}

function serializeUserPage(page: CallItUserPage) {
    return {
        ...page,
        activePredictions: page.activePredictions.map(serializePrediction),
        completedPredictions: page.completedPredictions.map(serializePrediction),
    };
}

function serializeTrackerDetail(detail: CallItTrackerDetail) {
    return {
        ...detail,
        tracker: serializeTracker(detail.tracker),
        history: serializeTrackerHistory(detail.history),
        activePredictions: detail.activePredictions.map(serializePrediction),
        completedPredictions: detail.completedPredictions.map(serializePrediction),
    };
}

function serializeSettings(settings: CallItSettingsView) {
    return {
        ...settings,
        lastSyncAt: settings.lastSyncAt?.toISOString() ?? null,
        updatedAt: settings.updatedAt.toISOString(),
    };
}

const durationSchema = t.Union([
    t.Literal('1d'),
    t.Literal('2d'),
    t.Literal('3d'),
    t.Literal('5d'),
    t.Literal('7d'),
    t.Literal('1m'),
]);
const wagerSchema = t.Union([
    t.Literal(100),
    t.Literal(250),
    t.Literal(500),
    t.Literal(1000),
]);
const intervalSchema = t.Union([
    t.Literal(5),
    t.Literal(10),
    t.Literal(15),
    t.Literal(20),
    t.Literal(30),
    t.Literal(60),
]);

export function createCallItModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    service: Service,
    preferencesService: PreferencesService,
    rescheduleSync: RescheduleSync,
) {
    return new Elysia({ prefix: '/callit', name: Modules.CALL_IT })
        .use(authMiddleware)
        .get('/preferences', async ({ user, status }) => {
            const result = await preferencesService.getPreferences(user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return result.value;
        }, { auth: true })
        .put('/preferences', async ({ user, body, status }) => {
            const result = await preferencesService.updatePreferences(user.id, body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return result.value;
        }, {
            body: t.Object({
                chartType: t.Union([t.Literal('line'), t.Literal('candlestick')]),
            }),
            auth: true,
        })
        .get('/overview', async ({ user, status }) => {
            const result = await service.getOverview(user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return serializeOverview(result.value);
        }, { auth: true })
        .get('/users/:id', async ({ user, params, status }) => {
            const result = await service.getUserPage(user.id, params.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return serializeUserPage(result.value);
        }, {
            params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }),
            auth: true,
        })
        .get('/trackers', async ({ status }) => {
            const result = await service.listActiveTrackers();
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { items: result.value.map(serializeTrackerListItem) };
        }, { auth: true })
        .get('/trackers/overview', async ({ query, status }) => {
            const result = await service.listActiveTrackersWithHistory(query.historyDays);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { items: result.value.map(serializeTrackerOverviewItem) };
        }, {
            query: t.Object({ historyDays: t.Optional(t.Numeric({ minimum: 1, maximum: CALL_IT_MAX_HISTORY_DAYS })) }),
            auth: true,
        })
        .get('/trackers/:id', async ({ user, params, query, status }) => {
            const result = await service.getTrackerDetail(user.id, params.id, {
                historyDays: query.historyDays,
            });
            if (!result.ok) return status(result.error.status, { error: result.error });
            return serializeTrackerDetail(result.value);
        }, {
            params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }),
            query: t.Object({ historyDays: t.Optional(t.Numeric({ minimum: 1, maximum: CALL_IT_MAX_HISTORY_DAYS })) }),
            auth: true,
        })
        .post('/predictions', async ({ user, body, status }) => {
            const result = await service.createPrediction(user.id, body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return status(result.value.created ? 201 : 200, {
                ...serializePrediction(result.value),
                created: result.value.created,
            });
        }, {
            body: t.Object({
                id: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
                trackerId: t.String({ minLength: 1, maxLength: 128 }),
                direction: t.Union([t.Literal('UP'), t.Literal('DOWN')]),
                durationKey: durationSchema,
                wager: wagerSchema,
            }),
            auth: true,
        })
        .get('/admin/trackers', async ({ user, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Tracker verwalten.' } });
            }
            const result = await service.listAllTrackersForAdmin();
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { items: result.value.map(serializeTrackerListItem) };
        }, { auth: true })
        .post('/admin/trackers/preview', async ({ user, body, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Tracker verwalten.' } });
            }
            const result = await service.previewTracker(body.symbol);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return serializeTrackerPreview(result.value);
        }, {
            body: t.Object({ symbol: t.String({ minLength: 1, maxLength: 20 }) }),
            auth: true,
        })
        .post('/admin/trackers', async ({ user, body, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Tracker verwalten.' } });
            }
            const result = await service.addTracker(user.id, body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return status(result.value.created ? 201 : 200, {
                ...serializeTrackerListItem(result.value.tracker),
                created: result.value.created,
            });
        }, {
            body: t.Object({
                symbol: t.String({ minLength: 1, maxLength: 20 }),
                name: t.Optional(t.String({ maxLength: 80 })),
            }),
            auth: true,
        })
        .delete('/admin/trackers/:id/full', async ({ user, params, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Tracker verwalten.' } });
            }
            const result = await service.fullyRemoveTracker(params.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, {
            params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }),
            auth: true,
        })
        .delete('/admin/trackers/:id', async ({ user, params, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Tracker verwalten.' } });
            }
            const result = await service.removeTracker(params.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, {
            params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }),
            auth: true,
        })
        .get('/admin/settings', async ({ user, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Einstellungen verwalten.' } });
            }
            const result = await service.getSettings();
            if (!result.ok) return status(result.error.status, { error: result.error });
            return serializeSettings(result.value);
        }, { auth: true })
        .put('/admin/settings', async ({ user, body, status }) => {
            if (!user.isAdmin) {
                return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Call-it-Einstellungen verwalten.' } });
            }
            const result = await service.updateSettings(user.id, body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            try {
                await rescheduleSync(result.value.updateIntervalMinutes);
            } catch (error) {
                logger.warn('failed to reschedule callit sync after settings update', { error: String(error) });
            }
            return serializeSettings(result.value);
        }, {
            body: t.Object({
                updateIntervalMinutes: t.Optional(intervalSchema),
                maxActivePredictionsPerUser: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
            }),
            auth: true,
        });
}
