import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type InternalError, type Result } from '../../lib/result';
import type { BroadcastPublisher } from '../../platform/realtime/service';
import type { CallItPreferencesChangedEvent } from '$shared/dto/platform-event';
import { callItPreference } from './schema';

export const CALL_IT_CHART_TYPES = ['line', 'candlestick'] as const;

export type CallItChartType = typeof CALL_IT_CHART_TYPES[number];

export type CallItPreferences = {
    chartType: CallItChartType;
};

export const CALL_IT_DEFAULT_CHART_TYPE: CallItChartType = 'line';

const DEFAULT_PREFERENCES: CallItPreferences = {
    chartType: CALL_IT_DEFAULT_CHART_TYPE,
};

export function isCallItChartType(value: unknown): value is CallItChartType {
    return CALL_IT_CHART_TYPES.some((chartType) => chartType === value);
}

export class CallItPreferencesService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async getPreferences(userId: string): Promise<Result<CallItPreferences, InternalError>> {
        try {
            const [row] = await this.db.select({
                chartType: callItPreference.chartType,
            }).from(callItPreference).where(eq(callItPreference.userId, userId)).limit(1);
            if (!row) return ok({ ...DEFAULT_PREFERENCES });
            if (!isCallItChartType(row.chartType)) {
                return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Call-it-Präferenzen sind ungültig.' });
            }
            return ok({ chartType: row.chartType });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Call-it-Präferenzen konnten nicht geladen werden.' });
        }
    }

    async updatePreferences(
        userId: string,
        preferences: { chartType: CallItChartType },
    ): Promise<Result<CallItPreferences, BadRequestError | InternalError>> {
        if (!isCallItChartType(preferences.chartType)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Diagrammtyp ist ungültig.' });
        }
        const validatedPreferences: CallItPreferences = { chartType: preferences.chartType };

        try {
            await this.db.insert(callItPreference).values({
                userId,
                chartType: validatedPreferences.chartType,
                updatedAt: this.clock(),
            }).onConflictDoUpdate({
                target: callItPreference.userId,
                set: {
                    chartType: validatedPreferences.chartType,
                    updatedAt: this.clock(),
                },
            });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Call-it-Präferenzen konnten nicht gespeichert werden.' });
        }

        const event: CallItPreferencesChangedEvent = {
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'callit.preferences.changed',
            action: 'UPDATED',
            entityId: 'callit-preferences',
        };
        try {
            const result = await this.broadcast([`user:${userId}`], event);
            if (!result.ok) return ok(validatedPreferences);
        } catch {
            // The database is authoritative; clients refetch after reconnect.
        }
        return ok(validatedPreferences);
    }
}
