import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type InternalError, type Result } from '../../lib/result';
import type { BroadcastPublisher } from '../../platform/realtime/service';
import type { CrewNowPreferencesChangedEvent } from '$shared/dto/platform-event';
import { crewNowPreference } from './schema';

export const CREWNOW_CAPTURE_DELAYS = [1, 2, 3, 5] as const;

export type CrewNowPreferences = {
    mirrorFrontPreview: boolean;
    captureDelaySeconds: typeof CREWNOW_CAPTURE_DELAYS[number];
};

const DEFAULT_PREFERENCES: CrewNowPreferences = {
    mirrorFrontPreview: true,
    captureDelaySeconds: 1,
};

function isCaptureDelay(value: unknown): value is CrewNowPreferences['captureDelaySeconds'] {
    return CREWNOW_CAPTURE_DELAYS.some((delay) => delay === value);
}

export class CrewNowPreferencesService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async getPreferences(userId: string): Promise<Result<CrewNowPreferences, InternalError>> {
        try {
            const [row] = await this.db.select({
                mirrorFrontPreview: crewNowPreference.mirrorFrontPreview,
                captureDelaySeconds: crewNowPreference.captureDelaySeconds,
            }).from(crewNowPreference).where(eq(crewNowPreference.userId, userId)).limit(1);
            if (!row) return ok({ ...DEFAULT_PREFERENCES });
            const captureDelaySeconds = row.captureDelaySeconds;
            if (!isCaptureDelay(captureDelaySeconds)) {
                return err({ status: 500, code: 'INTERNAL_ERROR', message: 'CrewNow-Präferenzen sind ungültig.' });
            }
            return ok({ mirrorFrontPreview: row.mirrorFrontPreview, captureDelaySeconds });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'CrewNow-Präferenzen konnten nicht geladen werden.' });
        }
    }

    async updatePreferences(
        userId: string,
        preferences: { mirrorFrontPreview: boolean; captureDelaySeconds: number },
    ): Promise<Result<CrewNowPreferences, BadRequestError | InternalError>> {
        if (typeof preferences.mirrorFrontPreview !== 'boolean' || !isCaptureDelay(preferences.captureDelaySeconds)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Die CrewNow-Präferenzen sind ungültig.' });
        }
        const validatedPreferences: CrewNowPreferences = {
            mirrorFrontPreview: preferences.mirrorFrontPreview,
            captureDelaySeconds: preferences.captureDelaySeconds,
        };

        try {
            await this.db.insert(crewNowPreference).values({
                userId,
                mirrorFrontPreview: validatedPreferences.mirrorFrontPreview,
                captureDelaySeconds: validatedPreferences.captureDelaySeconds,
                updatedAt: this.clock(),
            }).onConflictDoUpdate({
                target: crewNowPreference.userId,
                set: {
                    mirrorFrontPreview: validatedPreferences.mirrorFrontPreview,
                    captureDelaySeconds: validatedPreferences.captureDelaySeconds,
                    updatedAt: this.clock(),
                },
            });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'CrewNow-Präferenzen konnten nicht gespeichert werden.' });
        }

        const event: CrewNowPreferencesChangedEvent = {
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'crewnow.preferences.changed',
            data: {},
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