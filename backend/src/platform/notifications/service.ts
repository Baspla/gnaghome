import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type ConflictError, type InternalError, type NotFoundError, type Result } from '../../lib/result';
import { createLogger } from '../../lib/logger';
import type { BroadcastPublisher } from '../realtime/service';
import type { NotificationSettingsChangedEvent } from '$shared/dto/platform-event';
import {
    notificationPreference,
    notificationTopic,
    pushSubscription,
    type PushSubscriptionRecord,
} from './schema';

const logger = createLogger('notifications');
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 512;

export type NotificationTopicInput = {
    id: string;
    appId: string;
    label: string;
    description: string;
};

export type PushPayload = {
    title: string;
    body: string;
    url: string;
};

export type BrowserPushSubscription = {
    endpoint: string;
    keys: { p256dh: string; auth: string };
};

export type PushSender = (
    subscription: Pick<PushSubscriptionRecord, 'endpoint' | 'p256dh' | 'auth'>,
    payload: PushPayload,
) => Promise<void>;

type NotificationError = BadRequestError | InternalError | NotFoundError;

function validTopic(topic: NotificationTopicInput): boolean {
    return /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(topic.id)
        && /^[a-z][a-z0-9-]*$/.test(topic.appId)
        && topic.label.trim().length > 0 && topic.label.length <= 120
        && topic.description.length <= 500;
}

function normalizePushEndpoint(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) return null;
    try {
        const endpoint = new URL(value);
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port && endpoint.port !== '443') return null;
        const hostname = endpoint.hostname.toLowerCase();
        // Browser push services are remote HTTPS providers; reject local/private literals and local aliases.
        const trustedPushHost = hostname === 'fcm.googleapis.com'
            || hostname === 'updates.push.services.mozilla.com'
            || hostname.endsWith('.push.services.mozilla.com')
            || hostname === 'web.push.apple.com';
        if (!trustedPushHost) return null;
        return endpoint.toString();
    } catch {
        return null;
    }
}

function isPermanentPushFailure(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const statusCode = Reflect.get(error, 'statusCode');
    return statusCode === 404 || statusCode === 410;
}

export class NotificationsService {
    constructor(
        private readonly db: AppDatabase,
        private readonly sendPush: PushSender,
        private readonly clock: () => Date = () => new Date(),
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
    ) {}

    async registerTopics(topics: readonly NotificationTopicInput[]): Promise<Result<null, BadRequestError | InternalError>> {
        if (!Array.isArray(topics) || topics.some((topic) => !validTopic(topic))
            || new Set(topics.map((topic) => topic.id)).size !== topics.length) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Notification topic registration is invalid' });
        }
        const now = this.clock();
        try {
            for (const topic of topics) {
                await this.db.insert(notificationTopic).values({ ...topic, createdAt: now, updatedAt: now })
                    .onConflictDoUpdate({
                        target: notificationTopic.id,
                        set: { appId: topic.appId, label: topic.label, description: topic.description, updatedAt: now },
                    });
            }
            return ok(null);
        } catch (error) {
            logger.error('failed to register notification topics', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Notification topics could not be registered' });
        }
    }

    async getSettings(userId: string): Promise<Result<{
        topics: Array<NotificationTopicInput & { enabled: boolean }>;
        subscriptionsCount: number;
    }, InternalError>> {
        try {
            const [topics, preferences, subscriptions] = await Promise.all([
                this.db.select().from(notificationTopic).orderBy(notificationTopic.appId, notificationTopic.id),
                this.db.select().from(notificationPreference).where(eq(notificationPreference.userId, userId)),
                this.db.select({ id: pushSubscription.id }).from(pushSubscription).where(eq(pushSubscription.userId, userId)),
            ]);
            const enabledByTopic = new Map(preferences.map((preference) => [preference.topicId, preference.enabled]));
            return ok({
                topics: topics.map((topic) => ({
                    id: topic.id,
                    appId: topic.appId,
                    label: topic.label,
                    description: topic.description,
                    enabled: enabledByTopic.get(topic.id) ?? false,
                })),
                subscriptionsCount: subscriptions.length,
            });
        } catch (error) {
            logger.error('failed to read notification settings', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Notification settings could not be loaded' });
        }
    }

    async setPreference(userId: string, topicId: string, enabled: boolean): Promise<Result<null, NotificationError>> {
        if (typeof enabled !== 'boolean' || topicId.trim().length === 0 || topicId.length > 128) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Notification preference is invalid' });
        }
        try {
            const [topic] = await this.db.select({ id: notificationTopic.id }).from(notificationTopic)
                .where(eq(notificationTopic.id, topicId)).limit(1);
            if (!topic) return err({ status: 404, code: 'NOT_FOUND', message: 'Notification topic not found' });
            await this.db.insert(notificationPreference).values({
                userId, topicId, enabled, updatedAt: this.clock(),
            }).onConflictDoUpdate({
                target: [notificationPreference.userId, notificationPreference.topicId],
                set: { enabled, updatedAt: this.clock() },
            });
            await this.publishSettingsChanged(userId);
            return ok(null);
        } catch (error) {
            logger.error('failed to save notification preference', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Notification preference could not be saved' });
        }
    }

    async saveSubscription(userId: string, input: BrowserPushSubscription): Promise<Result<null, BadRequestError | ConflictError | InternalError>> {
        const endpoint = normalizePushEndpoint(input?.endpoint);
        const p256dh = input?.keys?.p256dh;
        const auth = input?.keys?.auth;
        if (!endpoint || typeof p256dh !== 'string' || p256dh.length < 1 || p256dh.length > MAX_KEY_LENGTH
            || typeof auth !== 'string' || auth.length < 1 || auth.length > MAX_KEY_LENGTH) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Push subscription is invalid' });
        }
        const now = this.clock();
        try {
            const [existing] = await this.db.select({ id: pushSubscription.id, userId: pushSubscription.userId })
                .from(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)).limit(1);
            if (existing && existing.userId !== userId) {
                return err({ status: 409, code: 'CONFLICT', message: 'Push subscription already belongs to another user' });
            }
            if (existing) {
                await this.db.update(pushSubscription).set({ p256dh, auth, updatedAt: now })
                    .where(and(eq(pushSubscription.id, existing.id), eq(pushSubscription.userId, userId)));
            } else {
                await this.db.insert(pushSubscription).values({
                id: randomUUID(), userId, endpoint, p256dh, auth, createdAt: now, updatedAt: now,
                }).onConflictDoNothing({ target: pushSubscription.endpoint });
                const [afterInsert] = await this.db.select({ userId: pushSubscription.userId })
                    .from(pushSubscription).where(eq(pushSubscription.endpoint, endpoint)).limit(1);
                if (afterInsert?.userId !== userId) {
                    return err({ status: 409, code: 'CONFLICT', message: 'Push subscription already belongs to another user' });
                }
            }
            await this.publishSettingsChanged(userId);
            return ok(null);
        } catch (error) {
            logger.error('failed to save browser push subscription', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Push subscription could not be saved' });
        }
    }

    async removeSubscription(userId: string, endpointValue: string): Promise<Result<boolean, BadRequestError | InternalError>> {
        const endpoint = normalizePushEndpoint(endpointValue);
        if (!endpoint) return err({ status: 400, code: 'BAD_REQUEST', message: 'Push subscription endpoint is invalid' });
        try {
            const removed = await this.db.delete(pushSubscription).where(and(
                eq(pushSubscription.userId, userId),
                eq(pushSubscription.endpoint, endpoint),
            )).returning({ id: pushSubscription.id });
            if (removed.length > 0) await this.publishSettingsChanged(userId);
            return ok(removed.length > 0);
        } catch (error) {
            logger.error('failed to remove browser push subscription', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Push subscription could not be removed' });
        }
    }

    async removeAllSubscriptions(userId: string): Promise<Result<number, InternalError>> {
        try {
            const removed = await this.db.delete(pushSubscription)
                .where(eq(pushSubscription.userId, userId))
                .returning({ id: pushSubscription.id });
            if (removed.length > 0) await this.publishSettingsChanged(userId);
            return ok(removed.length);
        } catch (error) {
            logger.error('failed to remove all browser push subscriptions', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Push subscriptions could not be removed' });
        }
    }

    async notifyUsers(topicId: string, userIds: readonly string[], payload: PushPayload): Promise<void> {
        if (userIds.length === 0 || !validPushPayload(payload)) return;
        try {
            const recipients = await this.db.select({
                userId: pushSubscription.userId,
                endpoint: pushSubscription.endpoint,
                p256dh: pushSubscription.p256dh,
                auth: pushSubscription.auth,
            }).from(pushSubscription)
                .innerJoin(notificationPreference, and(
                    eq(notificationPreference.userId, pushSubscription.userId),
                    eq(notificationPreference.topicId, topicId),
                    eq(notificationPreference.enabled, true),
                ))
                .where(inArray(pushSubscription.userId, [...new Set(userIds)]));

            await Promise.all(recipients.map(async (subscription) => {
                try {
                    await this.sendPush(subscription, payload);
                } catch (error) {
                    if (isPermanentPushFailure(error)) {
                        await this.db.delete(pushSubscription).where(eq(pushSubscription.endpoint, subscription.endpoint));
                        await this.publishSettingsChanged(subscription.userId);
                        return;
                    }
                    logger.warn('push delivery failed; subscription retained for retry on next event', {
                        statusCode: typeof error === 'object' && error !== null ? Reflect.get(error, 'statusCode') : undefined,
                    });
                }
            }));
        } catch (error) {
            logger.error('failed to dispatch push notifications', { error: String(error) });
        }
    }

    async notifyAll(topicId: string, excludedUserIds: readonly string[], payload: PushPayload): Promise<void> {
        try {
            const optedIn = await this.db.select({ userId: notificationPreference.userId })
                .from(notificationPreference).where(and(
                    eq(notificationPreference.topicId, topicId),
                    eq(notificationPreference.enabled, true),
                ));
            const excluded = new Set(excludedUserIds);
            await this.notifyUsers(topicId, optedIn.map((row) => row.userId).filter((userId) => !excluded.has(userId)), payload);
        } catch (error) {
            logger.error('failed to resolve notification recipients', { error: String(error) });
        }
    }

    private async publishSettingsChanged(userId: string): Promise<void> {
        const event: NotificationSettingsChangedEvent = {
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'notification-settings.changed',
            data: {},
        };
        try {
            const result = await this.broadcast([`user:${userId}`], event);
            if (!result.ok) logger.warn('notification settings invalidation failed', { userId, error: result.error.message });
        } catch {
            // The database remains authoritative; reconnecting clients refetch settings.
        }
    }
}

function validPushPayload(payload: PushPayload): boolean {
    return typeof payload.title === 'string' && payload.title.trim().length > 0 && payload.title.length <= 120
        && typeof payload.body === 'string' && payload.body.length <= 240
        && typeof payload.url === 'string' && payload.url.startsWith('/') && !payload.url.startsWith('//');
}