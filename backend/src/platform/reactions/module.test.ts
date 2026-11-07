import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { createAuthMiddleware } from '../auth';
import { createDatabase } from '../../db/connection';
import { user } from '../users/schema';
import { ReactionsService } from './service';
import { createReactionsModule } from './module';

describe('reactions HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: ReactionsService;
    let userId: string | null;
    let canView: boolean;

    function app() {
        const auth = createAuthMiddleware(
            async () => userId ? {
                user: {
                    id: userId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    name: userId,
                    email: `${userId}@example.test`,
                    emailVerified: true,
                    groups: '[]',
                    image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
        );
        return new Elysia().use(createReactionsModule(auth, service, async () => canView));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
        ]);
        service = new ReactionsService(database.db);
        userId = 'user-1';
        canView = true;
    });

    afterEach(() => database.close());

    it('authorizes both reading and writing through the target owner', async () => {
        canView = false;
        const deniedRead = await app().handle(new Request('http://localhost/reactions/targets/crewnow.post/post-1'));
        const deniedWrite = await app().handle(new Request('http://localhost/reactions/targets/crewnow.post/post-1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ emoji: '❤️' }),
        }));
        expect(deniedRead.status).toBe(404);
        expect(deniedWrite.status).toBe(404);

        canView = true;
        const saved = await app().handle(new Request('http://localhost/reactions/targets/crewnow.post/post-1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ emoji: '❤️' }),
        }));
        expect(saved.status).toBe(200);
        expect(await saved.json()).toEqual({ changed: true, reaction: { emoji: '❤️' } });

        const listed = await app().handle(new Request('http://localhost/reactions/targets/crewnow.post/post-1'));
        expect(listed.status).toBe(200);
        expect(await listed.json()).toMatchObject({
            count: 1,
            viewerReaction: '❤️',
            items: [{ emoji: '❤️', user: { id: 'user-1', name: 'Alice' } }],
        });
    });

    it('requires authentication and validates the emoji payload', async () => {
        userId = null;
        const unauthenticated = await app().handle(new Request('http://localhost/reactions/targets/crewnow.post/post-1'));
        expect(unauthenticated.status).toBe(401);

        userId = 'user-1';
        const invalid = await app().handle(new Request('http://localhost/reactions/targets/crewnow.post/post-1', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ emoji: '<script>' }),
        }));
        expect(invalid.status).toBe(400);
    });
});