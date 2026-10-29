import type { PlatformEvent } from './platform-event';

/** Validate untrusted Centrifugo publication data before exposing it to app code. */
export function isPlatformEvent(value: unknown): value is PlatformEvent {
    if (typeof value !== 'object' || value === null) return false;

    const event = value as Record<string, unknown>;
    if (typeof event.id !== 'string' || typeof event.occurredAt !== 'string') return false;

    switch (event.type) {
        case 'counter.changed': {
            if (typeof event.data !== 'object' || event.data === null) return false;
            const data = event.data as Record<string, unknown>;
            const { totalCount } = data;
            return typeof totalCount === 'number' && Number.isSafeInteger(totalCount) && totalCount >= 0;
        }
        case 'activity-feed.changed': {
            return typeof event.data === 'object'
                && event.data !== null
                && !Array.isArray(event.data)
                && Object.keys(event.data).length === 0;
        }
        default:
            return false;
    }
}