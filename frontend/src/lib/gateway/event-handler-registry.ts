import { PLATFORM_EVENT_TYPES, type PlatformEvent } from '../../../../shared/dto/platform-event';

export type PlatformEventHandler<TEventType extends PlatformEvent['type'] = PlatformEvent['type']> =
    (event: Extract<PlatformEvent, { type: TEventType }>) => void;

export type PlatformEventHandlers = Map<string, Set<PlatformEventHandler>>;

export function registerPlatformEventHandler(
    handlers: PlatformEventHandlers,
    eventType: string,
    handler: PlatformEventHandler,
): () => void {
    let handlersForType = handlers.get(eventType);
    if (!handlersForType) {
        handlersForType = new Set();
        handlers.set(eventType, handlersForType);
    }
    handlersForType.add(handler);
    return () => {
        handlersForType?.delete(handler);
        if (handlersForType?.size === 0) handlers.delete(eventType);
    };
}

export function dispatchPlatformEvent(handlers: PlatformEventHandlers, event: PlatformEvent): void {
    for (const handler of handlers.get(event.type) ?? []) handler(event);
}

export function isPlatformEventType(eventType: string): eventType is PlatformEvent['type'] {
    return PLATFORM_EVENT_TYPES.some((supportedType) => supportedType === eventType);
}