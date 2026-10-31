import webpush from 'web-push';
import type { PushSender } from './service';

export type VapidConfig = {
    publicKey?: string;
    privateKey?: string;
    subject?: string;
};

export function hasVapidConfig(config: VapidConfig): config is Required<VapidConfig> {
    return Boolean(config.publicKey && config.privateKey && config.subject);
}

export function createWebPushSender(config: VapidConfig): PushSender {
    if (!hasVapidConfig(config)) {
        return async () => { throw new Error('Web Push VAPID is not configured'); };
    }
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    return async (subscription, payload) => {
        await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, JSON.stringify(payload), { TTL: 60 * 60, urgency: 'normal' });
    };
}