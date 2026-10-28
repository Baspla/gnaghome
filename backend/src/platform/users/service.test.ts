import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { UserService } from './service';
import { user } from './schema';

describe('UserService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: UserService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        service = new UserService(database.db);
    });

    afterEach(() => database.close());

    it('returns profile fields including creation time without exposing private user fields', async () => {
        const createdAt = new Date('2025-12-31T23:00:00.000Z');
        await database.db.insert(user).values({
            id: 'user-1',
            name: 'Test User',
            email: 'user@example.test',
            image: 'https://example.test/avatar.png',
            createdAt,
        });

        const result = await service.getRedactedUserById('user-1');

        expect(result).toEqual({
            ok: true,
            value: {
                id: 'user-1',
                name: 'Test User',
                image: 'https://example.test/avatar.png',
                createdAt,
            },
        });
    });

    it('returns a not-found result for an unknown profile ID', async () => {
        expect(await service.getRedactedUserById('missing-user')).toEqual({
            ok: false,
            error: { status: 404, code: 'NOT_FOUND', message: 'User not found' },
        });
    });
});