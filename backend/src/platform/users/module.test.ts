import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { createAuthMiddleware } from '../auth';
import { user } from './schema';
import { UserService } from './service';
import { createUserModule } from './index';

describe('users HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let authenticated = true;
    let admin = false;
    let service: UserService;

    function app() {
        const auth = createAuthMiddleware(
            async () => authenticated ? {
                user: {
                    id: 'viewer', createdAt: new Date(), updatedAt: new Date(), name: 'Viewer',
                    email: 'viewer@example.test', emailVerified: true,
                    groups: admin ? '["admins"]' : '[]', image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
            'admins',
        );
        return new Elysia().use(createUserModule(auth, service));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        authenticated = true;
        admin = false;
        service = new UserService(database.db);
        await database.db.insert(user).values([
            { id: 'viewer', name: 'Viewer', email: 'viewer@example.test' },
            { id: 'other', name: 'Other', email: 'other@example.test', groups: '["private"]' },
        ]);
    });

    afterEach(() => database.close());

    it('returns the complete user list to an administrator without private account fields', async () => {
        admin = true;
        const response = await app().handle(new Request('http://localhost/users'));

        expect(response.status).toBe(200);
        const users = await response.json();
        expect(users).toHaveLength(2);
        expect(users).toContainEqual(expect.objectContaining({
            id: 'other',
            name: 'Other',
            email: 'other@example.test',
        }));
        expect(users[0]).not.toHaveProperty('groups');
        expect(users[0]).not.toHaveProperty('emailVerified');
    });

    it('rejects a non-admin user from listing users', async () => {
        const response = await app().handle(new Request('http://localhost/users'));

        expect(response.status).toBe(403);
    });

    it('requires authentication to list users', async () => {
        authenticated = false;
        const response = await app().handle(new Request('http://localhost/users'));

        expect(response.status).toBe(401);
    });
});
