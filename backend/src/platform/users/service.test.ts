import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { UserService } from './service';
import { user, userProfile } from './schema';

describe('UserService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: UserService;
    let broadcast: ReturnType<typeof mock>;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        broadcast = mock(async () => ({ ok: true as const, value: null }));
        service = new UserService(database.db, broadcast);
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
        await database.db.insert(userProfile).values({
            userId: 'user-1',
            bio: 'Hello there',
            accentColor: '#12abef',
        });

        const result = await service.getRedactedUserById('user-1');

        expect(result).toEqual({
            ok: true,
            value: {
                id: 'user-1',
                name: 'Test User',
                image: 'https://example.test/avatar.png',
                createdAt,
                bio: 'Hello there',
                accentColor: '#12abef',
            },
        });
    });

    it('returns a not-found result for an unknown profile ID', async () => {
        expect(await service.getRedactedUserById('missing-user')).toEqual({
            ok: false,
            error: { status: 404, code: 'NOT_FOUND', message: 'User not found' },
        });
    });

    it('creates a default profile when provisioning a user and preserves it on later upserts', async () => {
        expect(await service.upsertUserAsSystem({
            id: 'user-1', name: 'Test User', email: 'user@example.test',
        })).toMatchObject({ ok: true, value: { id: 'user-1' } });
        expect(await database.db.select().from(userProfile)).toEqual([{
            userId: 'user-1', bio: null, accentColor: '#6366f1',
        }]);

        await service.updateProfile('user-1', { bio: 'Bio', accentColor: '#123456' });
        await service.upsertUserAsSystem({
            id: 'user-1', name: 'Renamed User', email: 'user@example.test',
        });

        expect(await database.db.select().from(userProfile)).toEqual([{
            userId: 'user-1', bio: 'Bio', accentColor: '#123456',
        }]);
    });

    it('persists profile customization and returns normalized values', async () => {
        await database.db.insert(user).values({
            id: 'user-1', name: 'Test User', email: 'user@example.test',
        });
        await database.db.insert(userProfile).values({
            userId: 'user-1', bio: null, accentColor: '#6366f1',
        });
        const result = await service.updateProfile('user-1', {
            bio: '  A new bio  ',
            accentColor: '#A1B2C3',
        });

        expect(result).toEqual({ ok: true, value: { bio: 'A new bio', accentColor: '#a1b2c3' } });
        expect(await service.getRedactedUserById('user-1')).toMatchObject({
            ok: true,
            value: { bio: 'A new bio', accentColor: '#a1b2c3' },
        });
        expect(await database.db.select().from(userProfile)).toEqual([{
            userId: 'user-1', bio: 'A new bio', accentColor: '#a1b2c3',
        }]);
        expect(broadcast).toHaveBeenCalledWith(['public'], expect.objectContaining({
            type: 'user.profile.changed',
            action: 'UPDATED',
            entityId: 'user-1',
            occurredAt: expect.any(String),
        }));
        expect(broadcast.mock.calls[0]?.[1]).not.toHaveProperty('data');
    });

    it('rejects overlong bios and invalid colors without changing the profile', async () => {
        await database.db.insert(user).values({
            id: 'user-1', name: 'Test User', email: 'user@example.test',
        });
        await database.db.insert(userProfile).values({
            userId: 'user-1', bio: 'Hello there', accentColor: '#12abef',
        });
        expect(await service.updateProfile('user-1', { bio: 'x'.repeat(301), accentColor: '#ffffff' }))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.updateProfile('user-1', { bio: 'valid', accentColor: 'red' }))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.getRedactedUserById('user-1')).toMatchObject({
            ok: true,
            value: { bio: 'Hello there', accentColor: '#12abef' },
        });
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('lists users with only the fields needed by the admin user view', async () => {
        const createdAt = new Date('2025-12-31T23:00:00.000Z');
        await database.db.insert(user).values([
            {
                id: 'user-1',
                name: 'Alice',
                email: 'alice@example.test',
                image: 'https://example.test/alice.png',
                createdAt,
                groups: '["admins"]',
            },
            {
                id: 'user-2',
                name: 'Bob',
                email: 'bob@example.test',
                image: null,
                createdAt,
            },
        ]);

        const users = await service.listUsers();

        expect(users).toHaveLength(2);
        expect(users).toContainEqual({
            id: 'user-1',
            name: 'Alice',
            email: 'alice@example.test',
            image: 'https://example.test/alice.png',
        });
        expect(users).toContainEqual({
            id: 'user-2',
            name: 'Bob',
            email: 'bob@example.test',
            image: null,
        });
        expect(users[0]).not.toHaveProperty('groups');
        expect(users[0]).not.toHaveProperty('emailVerified');
    });
});