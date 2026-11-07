import { describe, expect, it, mock } from 'bun:test';
import { dispatchPlatformEvent, registerPlatformEventHandler, type PlatformEventHandlers } from '../frontend/src/lib/gateway/event-handler-registry';

describe('GatewayManager event routing', () => {
    it('registers and removes handlers by event type', () => {
        const registry: PlatformEventHandlers = new Map();
        const discussionHandler = mock(() => {});
        const otherHandler = mock(() => {});
        const unsubscribe = registerPlatformEventHandler(registry, 'discussion.changed', discussionHandler);
        registerPlatformEventHandler(registry, 'custom-emojis.changed', otherHandler);

        dispatchPlatformEvent(registry, {
            id: 'event-1', occurredAt: '2026-11-07T12:34:56.000Z',
            type: 'discussion.changed', action: 'CREATED', entityId: 'discussion-1',
        });

        expect(discussionHandler).toHaveBeenCalledTimes(1);
        expect(otherHandler).not.toHaveBeenCalled();
        unsubscribe();
        dispatchPlatformEvent(registry, {
            id: 'event-2', occurredAt: '2026-11-07T12:34:56.000Z',
            type: 'discussion.changed', action: 'UPDATED', entityId: 'discussion-1',
        });
        expect(discussionHandler).toHaveBeenCalledTimes(1);
    });
});