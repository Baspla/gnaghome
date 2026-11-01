import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { createAuthMiddleware } from '../auth';
import type { BrowserPushSubscription, NotificationsService } from './service';

type Service = Pick<NotificationsService, 'getSettings' | 'setPreference' | 'saveSubscription' | 'removeSubscription' | 'removeAllSubscriptions'>;

export function createNotificationsModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    service: Service,
    vapidPublicKey: string | undefined,
) {
    return new Elysia({ prefix: '/notifications', name: Modules.NOTIFICATIONS })
        .use(authMiddleware)
        .get('/settings', async ({ user, status }) => {
            const result = await service.getSettings(user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { ...result.value, vapidPublicKey: vapidPublicKey ?? null };
        }, { auth: true })
        .put('/preferences/:topicId', async ({ user, params, body, status }) => {
            const result = await service.setPreference(user.id, params.topicId, body.enabled);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, {
            params: t.Object({ topicId: t.String({ minLength: 1, maxLength: 128 }) }),
            body: t.Object({ enabled: t.Boolean() }),
            auth: true,
        })
        .post('/subscriptions', async ({ user, body, status }) => {
            const result = await service.saveSubscription(user.id, body as BrowserPushSubscription);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return status(201, { success: true });
        }, {
            body: t.Object({
                endpoint: t.String({ minLength: 1, maxLength: 2048 }),
                keys: t.Object({ p256dh: t.String({ minLength: 1, maxLength: 512 }), auth: t.String({ minLength: 1, maxLength: 512 }) }),
            }),
            auth: true,
        })
        .delete('/subscriptions/all', async ({ user, status }) => {
            const result = await service.removeAllSubscriptions(user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true, removed: result.value };
        }, { auth: true })
        .delete('/subscriptions', async ({ user, body, status }) => {
            const result = await service.removeSubscription(user.id, body.endpoint);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true, removed: result.value };
        }, {
            body: t.Object({ endpoint: t.String({ minLength: 1, maxLength: 2048 }) }),
            auth: true,
        });
}