/// <reference lib="webworker" />

const worker = self as unknown as ServiceWorkerGlobalScope;

type PushNotificationData = {
    title: string;
    body: string;
    url: string;
};

function parsePushData(value: unknown): PushNotificationData | null {
    if (typeof value !== 'object' || value === null) return null;
    const data = value as Record<string, unknown>;
    if (typeof data.title !== 'string' || typeof data.body !== 'string' || typeof data.url !== 'string') return null;
    if (!data.url.startsWith('/') || data.url.startsWith('//')) return null;
    return { title: data.title.slice(0, 120), body: data.body.slice(0, 240), url: data.url };
}

worker.addEventListener('push', (event: PushEvent) => {
    event.waitUntil((async () => {
        let data: PushNotificationData | null = null;
        try {
            data = parsePushData(event.data?.json());
        } catch {
            data = null;
        }
        if (!data) return;
        await worker.registration.showNotification(data.title, {
            body: data.body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            data: { url: data.url },
        });
    })());
});

worker.addEventListener('notificationclick', (event: NotificationEvent) => {
    event.notification.close();
    const data = parsePushData({
        title: event.notification.title,
        body: event.notification.body ?? '',
        url: event.notification.data?.url,
    });
    if (!data) return;
    event.waitUntil((async () => {
        const destination = new URL(data.url, worker.location.origin);
        const windowClients = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windowClients) {
            if (client.url.startsWith(worker.location.origin) && 'focus' in client) {
                await client.navigate(destination.href);
                await client.focus();
                return;
            }
        }
        await worker.clients.openWindow(destination.href);
    })());
});