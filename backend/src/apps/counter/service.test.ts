import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { user } from '../../platform/users/schema';
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

        expect(result).toEqual({ ok: true, value: { userCount: 0, totalCount: 0, leaderboard: [] } });
        expect(await database.db.select().from(counter).all()).toEqual([
            { id: 'global:counter', count: 0 },
            { id: 'user:user-1', count: 0 },
        ]);
    });

    it('increments both counts and broadcasts the changed global count', async () => {
        const result = await service.increment('user-1');

        expect(result).toEqual({ ok: true, value: { userCount: 1, totalCount: 1, leaderboard: [] } });
        expect(broadcast).toHaveBeenCalledTimes(1);
        expect(broadcast.mock.calls[0]?.[0]).toEqual(['public:counter']);
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
            value: { userCount: 2, totalCount: 3, leaderboard: [] },
        });
        expect(await service.getCounts('user-2')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 3, leaderboard: [] },
        });
    });

    it('returns a ranked leaderboard with all registered users ordered by their personal counts', async () => {
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test', image: 'https://example.test/alice.png' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
            { id: 'user-3', name: 'Casey', email: 'casey@example.test' },
        ]);
        expect((await service.increment('user-1'))).toMatchObject({
            ok: true,
            value: {
                leaderboard: [
                    { id: 'user-1', rank: 1, name: 'Alice', image: 'https://example.test/alice.png', count: 1 },
                    { id: 'user-2', rank: 2, name: 'Bob', image: null, count: 0 },
                    { id: 'user-3', rank: 3, name: 'Casey', image: null, count: 0 },
                ],
            },
        });
        expect((await service.increment('user-1'))).toMatchObject({
            ok: true,
            value: {
                leaderboard: [
                    { id: 'user-1', rank: 1, name: 'Alice', image: 'https://example.test/alice.png', count: 2 },
                    { id: 'user-2', rank: 2, name: 'Bob', image: null, count: 0 },
                    { id: 'user-3', rank: 3, name: 'Casey', image: null, count: 0 },
                ],
            },
        });
        expect((await service.increment('user-2'))).toMatchObject({
            ok: true,
            value: {
                leaderboard: [
                    { id: 'user-1', rank: 1, name: 'Alice', image: 'https://example.test/alice.png', count: 2 },
                    { id: 'user-2', rank: 2, name: 'Bob', image: null, count: 1 },
                    { id: 'user-3', rank: 3, name: 'Casey', image: null, count: 0 },
                ],
            },
        });

        const result = await service.getCounts('user-2');

        expect(result).toEqual({
            ok: true,
            value: {
                userCount: 1,
                totalCount: 3,
                leaderboard: [
                    { id: 'user-1', rank: 1, name: 'Alice', image: 'https://example.test/alice.png', count: 2 },
                    { id: 'user-2', rank: 2, name: 'Bob', image: null, count: 1 },
                    { id: 'user-3', rank: 3, name: 'Casey', image: null, count: 0 },
                ],
            },
        });
    });

    it('keeps the committed count when realtime publishing is unavailable', async () => {
        broadcast.mockImplementation(async () => ({
            ok: false,
            error: { status: 500, code: 'INTERNAL_ERROR', message: 'Realtime unavailable' },
        }));

        expect(await service.increment('user-1')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 1, leaderboard: [] },
        });
        expect(await service.getCounts('user-1')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 1, leaderboard: [] },
        });
    });

    it('keeps the committed count if the realtime publisher throws unexpectedly', async () => {
        broadcast.mockImplementation(async () => { throw new Error('publisher crashed'); });

        expect(await service.increment('user-1')).toEqual({
            ok: true,
            value: { userCount: 1, totalCount: 1, leaderboard: [] },
        });
    });
});