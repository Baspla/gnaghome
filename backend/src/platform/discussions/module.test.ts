import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { createAuthMiddleware } from '../auth';
import { user } from '../users/schema';
import { DiscussionsService } from './service';
import { createDiscussionsModule } from './module';

describe('discussions HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: DiscussionsService;
    let sessionUserId: string | null;
    let canView: boolean;
    let discussionId: string;

    function app() {
        const auth = createAuthMiddleware(
            async () => sessionUserId ? {
                user: {
                    id: sessionUserId,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    name: sessionUserId,
                    email: `${sessionUserId}@example.test`,
                    emailVerified: true,
                    groups: '[]',
                    image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
        );
        return new Elysia().use(createDiscussionsModule(auth, service, async () => canView));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'user-1@example.test' },
            { id: 'user-2', name: 'Bob', email: 'user-2@example.test' },
        ]);
        service = new DiscussionsService(database.db, async () => ok(null));
        const discussion = await service.getOrCreateDiscussion('crewnow.post', 'post-1');
        if (!discussion.ok) throw new Error('discussion setup failed');
        discussionId = discussion.value.id;
        sessionUserId = 'user-1';
        canView = true;
    });

    afterEach(() => database.close());

    it('requires an authenticated, authorized target viewer for reads and writes', async () => {
        sessionUserId = null;
        const unauthenticated = await app().handle(new Request(`http://localhost/discussions/${discussionId}/messages`));
        expect(unauthenticated.status).toBe(401);

        sessionUserId = 'user-1';
        canView = false;
        const denied = await app().handle(new Request(`http://localhost/discussions/${discussionId}/messages`));
        expect(denied.status).toBe(404);
        const deniedCreate = await app().handle(new Request(`http://localhost/discussions/${discussionId}/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: 'should not be stored' }),
        }));
        expect(deniedCreate.status).toBe(404);
        expect(await service.getMessages(discussionId, 'user-1')).toMatchObject({ ok: true, value: [] });
    });

    it('lists authored messages and restricts edits to the author at the HTTP boundary', async () => {
        const created = await app().handle(new Request(`http://localhost/discussions/${discussionId}/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: 'Hallo' }),
        }));
        expect(created.status).toBe(201);
        const message = await created.json() as { id: string };

        sessionUserId = 'user-2';
        const denied = await app().handle(new Request(`http://localhost/discussions/messages/${message.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: 'Fremde Bearbeitung' }),
        }));
        expect(denied.status).toBe(403);

        sessionUserId = 'user-1';
        const response = await app().handle(new Request(`http://localhost/discussions/${discussionId}/messages`));
        expect(await response.json()).toMatchObject({ items: [{ body: 'Hallo', canEdit: true }] });
    });
});