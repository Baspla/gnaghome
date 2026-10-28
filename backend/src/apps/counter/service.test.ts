import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { counter } from './schema';
import { CounterService } from './service';

describe('CounterService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let broadcast: ReturnType<typeof mock>;
    let service: CounterService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        broadcast = mock(async () => ok(null));
        service = new CounterService(database.db, broadcast);
    });

    afterEach(() => database.close());

    it('returns zero counts for a new user and initializes the shared total', async () => {
        const result = await service.getCounts('user-1');

        expect(result).toEqual({ ok: true, value: { userCount: 0, totalCount: 0 } });
        expect(await database.db.select().from(counter).all()).toEqual([
            { id: 'global:counter', count: 0 },
            { id: 'user:user-1', count: 0 },
        ]);
    });

    it('increments both counts and broadcasts the changed global count', async () => {
        const result = await service.increment('user-1');

        expect(result).toEqual({ ok: true, value: { userCount: 1, totalCount: 1 } });
        expect(broadcast).toHaveBeenCalledTimes(1);
        expect(broadcast.mock.calls[0]?.[0]).toEqual(['counter:global']);
        expect(broadcast.mock.calls[0]?.[1]).toMatchObject({
            type: 'counter.changed',
            data: { totalCount: 1 },
        });
    });

    it('keeps each user count separate while maintaining one global total', async () => {
        await service.increment('user-1');
        await service.increment('user-1');
        await service.increment('user-2');

        expect(await service.getCounts('user-1')).toEqual({
            ok: true,
            value: { userCount: 2, totalCount: 3 },
        });
        expect(await service.getCounts('user-2')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 3 },
        });
    });

    it('keeps the committed count when realtime publishing is unavailable', async () => {
        broadcast.mockImplementation(async () => ({
            ok: false,
            error: { status: 500, code: 'INTERNAL_ERROR', message: 'Realtime unavailable' },
        }));

        expect(await service.increment('user-1')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 1 },
        });
        expect(await service.getCounts('user-1')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 1 },
        });
    });

    it('keeps the committed count if the realtime publisher throws unexpectedly', async () => {
        broadcast.mockImplementation(async () => { throw new Error('publisher crashed'); });

        expect(await service.increment('user-1')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 1 },
        });
    });
});