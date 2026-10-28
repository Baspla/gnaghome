import { eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { counter } from './schema';
import { err, ok, type InternalError, type Result } from '../../lib/result';
import type { BroadcastPublisher } from '../../platform/realtime/service';
import { createLogger } from '../../lib/logger';
import type { CounterChangedEvent } from '$shared/dto/platform-event';

const logger = createLogger('counter');
const GLOBAL_COUNTER_ID = 'global:counter';
const counterRowId = (userId: string) => `user:${userId}`;

export type CounterCounts = {
    userCount: number;
    totalCount: number;
};

export class CounterService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher,
    ) {}

    async getCounts(userId: string): Promise<Result<CounterCounts, InternalError>> {
        try {
            const counts = this.db.transaction((transaction) => {
                transaction.insert(counter)
                    .values([
                        { id: GLOBAL_COUNTER_ID, count: 0 },
                        { id: counterRowId(userId), count: 0 },
                    ])
                    .onConflictDoNothing()
                    .run();
                const userRow = transaction.select({ count: counter.count })
                    .from(counter)
                    .where(eq(counter.id, counterRowId(userId)))
                    .get();
                const globalRow = transaction.select({ count: counter.count })
                    .from(counter)
                    .where(eq(counter.id, GLOBAL_COUNTER_ID))
                    .get();

                return {
                    userCount: userRow?.count ?? 0,
                    totalCount: globalRow?.count ?? 0,
                };
            });
            return ok(counts);
        } catch (error) {
            logger.error('failed to read counter counts', { userId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to read counter counts' });
        }
    }

    async increment(userId: string): Promise<Result<CounterCounts, InternalError>> {
        let counts: CounterCounts;
        try {
            counts = this.db.transaction((transaction) => {
                transaction.insert(counter)
                    .values([
                        { id: GLOBAL_COUNTER_ID, count: 0 },
                        { id: counterRowId(userId), count: 0 },
                    ])
                    .onConflictDoNothing()
                    .run();
                transaction.update(counter)
                    .set({ count: sql`${counter.count} + 1` })
                    .where(eq(counter.id, counterRowId(userId)))
                    .run();
                transaction.update(counter)
                    .set({ count: sql`${counter.count} + 1` })
                    .where(eq(counter.id, GLOBAL_COUNTER_ID))
                    .run();
                const userRow = transaction.select({ count: counter.count })
                    .from(counter)
                    .where(eq(counter.id, counterRowId(userId)))
                    .get();
                const globalRow = transaction.select({ count: counter.count })
                    .from(counter)
                    .where(eq(counter.id, GLOBAL_COUNTER_ID))
                    .get();

                return {
                    userCount: userRow?.count ?? 0,
                    totalCount: globalRow?.count ?? 0,
                };
            }, { behavior: 'immediate' });
        } catch (error) {
            logger.error('failed to increment counter', { userId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to increment counter' });
        }

        // The database is canonical; a Centrifugo outage must not undo a click.
        try {
            const event: CounterChangedEvent = {
                id: crypto.randomUUID(),
                occurredAt: new Date().toISOString(),
                type: 'counter.changed',
                data: { totalCount: counts.totalCount },
            };
            const publishResult = await this.broadcast(['counter:global'], event);
            if (publishResult.ok) return ok(counts);

            logger.warn('counter changed but realtime notification failed', {
                userId,
                message: publishResult.error.message,
            });
        } catch (error) {
            logger.warn('counter changed but realtime notification failed', { userId, error: String(error) });
        }

        return ok(counts);
    }

}