import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { createAuthMiddleware } from '../auth';
import { user } from '../users/schema';
import { NotificationsService } from './service';
import { NOTIFICATION_TOPICS } from './catalog';
import { createNotificationsModule } from './module';

describe('notifications HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: NotificationsService;
    let authenticated = true;

    function app() {
        const auth = createAuthMiddleware(
            async () => authenticated ? {
                user: {
                    id: 'user-1', createdAt: new Date(), updatedAt: new Date(), name: 'Alice',
                    email: 'alice@example.test', emailVerified: true, groups: '[]', image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
        );
        return new Elysia().use(createNotificationsModule(auth, service, 'public-vapid-key'));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        authenticated = true;
        await database.db.insert(user).values({ id: 'user-1', name: 'Alice', email: 'alice@example.test' });
        service = new NotificationsService(database.db, async () => {});
        const registered = await service.registerTopics(NOTIFICATION_TOPICS);
        if (!registered.ok) throw new Error(registered.error.message);
    });

    afterEach(() => database.close());

    it('serves the registered catalogue and accepts only known per-user preferences', async () => {
        const settings = await app().handle(new Request('http://localhost/notifications/settings'));
        expect(settings.status).toBe(200);
        expect(await settings.json()).toMatchObject({
            vapidPublicKey: 'public-vapid-key',
            topics: expect.arrayContaining([expect.objectContaining({ id: 'crewnow.post.new', enabled: false })]),
        });

        const saved = await app().handle(new Request('http://localhost/notifications/preferences/crewnow.post.new', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
        }));
        expect(saved.status).toBe(200);

        const rejected = await app().handle(new Request('http://localhost/notifications/preferences/unknown.topic', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
        }));
        expect(rejected.status).toBe(404);
    });

    it('requires authentication for preferences and subscriptions', async () => {
        authenticated = false;
        const response = await app().handle(new Request('http://localhost/notifications/preferences/crewnow.post.new', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled: true }),
        }));
        expect(response.status).toBe(401);

        const removeAllResponse = await app().handle(new Request('http://localhost/notifications/subscriptions/all', {
            method: 'DELETE',
        }));
        expect(removeAllResponse.status).toBe(401);
    });

    it('removes all push subscriptions for the authenticated user', async () => {
        await service.saveSubscription('user-1', {
            endpoint: 'https://fcm.googleapis.com/user-one-device',
            keys: { p256dh: 'public-key-one', auth: 'auth-secret-one' },
        });

        const response = await app().handle(new Request('http://localhost/notifications/subscriptions/all', {
            method: 'DELETE',
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true, removed: 1 });
        const settings = await service.getSettings('user-1');
        expect(settings.ok && settings.value.subscriptionsCount).toBe(0);
    });
});