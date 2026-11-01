import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { user } from '../users/schema';
import { NotificationsService } from './service';
import { NOTIFICATION_TOPICS } from './catalog';

describe('NotificationsService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let sendPush: ReturnType<typeof mock>;
    let broadcast: ReturnType<typeof mock>;
    let service: NotificationsService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
        sendPush = mock(async () => {});
        broadcast = mock(async () => ({ ok: true as const, value: null }));
        service = new NotificationsService(database.db, sendPush, undefined, broadcast);
        const registered = await service.registerTopics(NOTIFICATION_TOPICS);
        if (!registered.ok) throw new Error(registered.error.message);
    });

    afterEach(() => database.close());

    it('returns registered topics grouped by app and defaults user choices to off', async () => {
        const settings = await service.getSettings('user-1');

        expect(settings).toMatchObject({ ok: true, value: { subscriptionsCount: 0 } });
        if (!settings.ok) return;
        expect(settings.value.topics).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'crewnow.post.new', appId: 'crewnow', enabled: false }),
            expect.objectContaining({ id: 'discussions.post-comment', appId: 'discussions', enabled: false }),
        ]));
    });

    it('persists opt-in preferences and rejects unregistered topics', async () => {
        expect(await service.setPreference('user-1', 'crewnow.post.new', true)).toMatchObject({ ok: true });
        expect(broadcast).toHaveBeenCalledWith(['user:user-1'], expect.objectContaining({ type: 'notification-settings.changed', data: {} }));
        const settings = await service.getSettings('user-1');
        expect(settings.ok).toBe(true);
        if (settings.ok) expect(settings.value.topics).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'crewnow.post.new', enabled: true }),
        ]));
        expect(await service.setPreference('user-1', 'crewnow.unregistered', true))
            .toMatchObject({ ok: false, error: { status: 404 } });
    });

    it('stores subscriptions per user, allows owner-only removal, and sends only to opted-in users', async () => {
        const first = {
            endpoint: 'https://fcm.googleapis.com/subscription-1',
            keys: { p256dh: 'public-key-one', auth: 'auth-secret-one' },
        };
        const second = {
            endpoint: 'https://updates.push.services.mozilla.com/subscription-2',
            keys: { p256dh: 'public-key-two', auth: 'auth-secret-two' },
        };
        expect(await service.saveSubscription('user-1', first)).toMatchObject({ ok: true });
        expect(await service.saveSubscription('user-1', second)).toMatchObject({ ok: true });
        expect(await service.setPreference('user-1', 'crewnow.post.new', true)).toMatchObject({ ok: true });

        await service.notifyUsers('crewnow.post.new', ['user-1', 'user-2'], {
            title: 'Neuer CrewNow',
            body: 'Alice hat einen CrewNow gepostet.',
            url: '/crewnow',
        });

        expect(sendPush).toHaveBeenCalledTimes(2);
        expect(broadcast).toHaveBeenCalledTimes(3);
        expect(await service.removeSubscription('user-2', first.endpoint)).toMatchObject({ ok: true, value: false });
        expect(await service.removeSubscription('user-1', first.endpoint)).toMatchObject({ ok: true, value: true });
        const settings = await service.getSettings('user-1');
        expect(settings.ok && settings.value.subscriptionsCount).toBe(1);
    });

    it('removes all subscriptions belonging to one user and publishes settings invalidation', async () => {
        await service.saveSubscription('user-1', {
            endpoint: 'https://fcm.googleapis.com/user-one-device',
            keys: { p256dh: 'public-key-one', auth: 'auth-secret-one' },
        });
        await service.saveSubscription('user-1', {
            endpoint: 'https://updates.push.services.mozilla.com/user-one-device-two',
            keys: { p256dh: 'public-key-two', auth: 'auth-secret-two' },
        });
        await service.saveSubscription('user-2', {
            endpoint: 'https://fcm.googleapis.com/user-two-device',
            keys: { p256dh: 'public-key-three', auth: 'auth-secret-three' },
        });
        broadcast.mockClear();

        expect(await service.removeAllSubscriptions('user-1')).toMatchObject({ ok: true, value: 2 });
        expect(broadcast).toHaveBeenCalledTimes(1);
        expect(broadcast).toHaveBeenCalledWith(['user:user-1'], expect.objectContaining({
            type: 'notification-settings.changed',
            data: {},
        }));
        const alice = await service.getSettings('user-1');
        const bob = await service.getSettings('user-2');
        expect(alice.ok && alice.value.subscriptionsCount).toBe(0);
        expect(bob.ok && bob.value.subscriptionsCount).toBe(1);
    });

    it('does not let a different user take over an existing browser subscription', async () => {
        const subscription = {
            endpoint: 'https://fcm.googleapis.com/subscription-owned',
            keys: { p256dh: 'public-key', auth: 'auth-secret' },
        };
        expect(await service.saveSubscription('user-1', subscription)).toMatchObject({ ok: true });
        expect(await service.saveSubscription('user-2', subscription)).toMatchObject({ ok: false, error: { status: 409 } });

        const alice = await service.getSettings('user-1');
        const bob = await service.getSettings('user-2');
        expect(alice.ok && alice.value.subscriptionsCount).toBe(1);
        expect(bob.ok && bob.value.subscriptionsCount).toBe(0);
    });

    it('rejects non-HTTPS, malformed, or oversized push subscription data', async () => {
        expect(await service.saveSubscription('user-1', {
            endpoint: 'http://push.example.test/subscription',
            keys: { p256dh: 'key', auth: 'secret' },
        })).toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.saveSubscription('user-1', {
            endpoint: 'https://localhost/subscription',
            keys: { p256dh: 'key', auth: 'secret' },
        })).toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.saveSubscription('user-1', {
            endpoint: `https://fcm.googleapis.com/${'x'.repeat(3000)}`,
            keys: { p256dh: 'key', auth: 'secret' },
        })).toMatchObject({ ok: false, error: { status: 400 } });
    });

    it('removes subscriptions that the push service reports as permanently gone', async () => {
        sendPush.mockImplementation(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
        await service.saveSubscription('user-1', {
            endpoint: 'https://fcm.googleapis.com/gone',
            keys: { p256dh: 'public-key', auth: 'auth-secret' },
        });
        await service.setPreference('user-1', 'crewnow.post.new', true);

        await service.notifyUsers('crewnow.post.new', ['user-1'], { title: 'Test', body: 'Test', url: '/crewnow' });

        const settings = await service.getSettings('user-1');
        expect(settings.ok && settings.value.subscriptionsCount).toBe(0);
    });
});