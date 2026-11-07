import { PLATFORM_EVENT_TYPES, type PlatformEvent } from './platform-event';

const EVENT_TYPES = new Set<string>(PLATFORM_EVENT_TYPES);
const EVENT_ACTIONS = new Set(['CREATED', 'UPDATED', 'DELETED']);
const EVENT_KEYS = new Set(['id', 'occurredAt', 'type', 'action', 'entityId']);

/** Validate untrusted Centrifugo publication data before exposing it to app code. */
export function isPlatformEvent(value: unknown): value is PlatformEvent {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const event = value as Record<string, unknown>;
    return Object.keys(event).length === EVENT_KEYS.size
        && Object.keys(event).every((key) => EVENT_KEYS.has(key))
        && typeof event.id === 'string'
        && event.id.length > 0
        && typeof event.occurredAt === 'string'
        && Number.isFinite(Date.parse(event.occurredAt))
        && new Date(event.occurredAt).toISOString() === event.occurredAt
        && typeof event.type === 'string'
        && EVENT_TYPES.has(event.type as PlatformEvent['type'])
        && typeof event.action === 'string'
        && EVENT_ACTIONS.has(event.action)
        && typeof event.entityId === 'string'
        && event.entityId.length > 0;
}