import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { user } from '../users/schema';
import { activityFeedItem } from './schema';
import { ActivityFeedService } from './service';

describe('ActivityFeedService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: ActivityFeedService;
    let broadcast: ReturnType<typeof mock>;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
        broadcast = mock(async () => ok(null));
        service = new ActivityFeedService(database.db, broadcast);
    });

    afterEach(() => database.close());

    it('persists typed activity data, actor, subject, target, and event time', async () => {
        const occurredAt = new Date('2026-10-28T12:00:00.000Z');
        const result = await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'user-1',
            subjectUserId: 'user-1',
            target: { type: 'platform.profile', id: 'user-1' },
            data: { changedFields: ['name', 'image'] },
            occurredAt,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toMatchObject({
            type: 'profile.updated',
            actorUserId: 'user-1',
            subjectUserId: 'user-1',
            targetType: 'platform.profile',
            targetId: 'user-1',
            data: { changedFields: ['name', 'image'] },
            occurredAt,
        });
        expect(result.value.id).toBeString();
        expect(result.value.createdAt).toBeInstanceOf(Date);
    });

    it('broadcasts only an invalidation after an activity is durably recorded', async () => {
        const result = await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'user-1',
            subjectUserId: 'user-1',
            target: { type: 'platform.profile', id: 'user-1' },
            data: { changedFields: ['name'] },
        });

        expect(result.ok).toBe(true);
        expect(broadcast).toHaveBeenCalledTimes(1);
        expect(broadcast.mock.calls[0]?.[0]).toEqual(['public:activity-feed']);
        expect(broadcast.mock.calls[0]?.[1]).toMatchObject({
            type: 'activity-feed.changed',
            data: {},
        });
        expect(JSON.stringify(broadcast.mock.calls[0]?.[1])).not.toContain('user-1');
    });

    it('rejects counter milestone activities after that feature is removed', async () => {
        broadcast.mockImplementation(async () => {
            throw new Error('Centrifugo unavailable');
        });

        const result = await service.recordActivity({
            type: 'counter.milestone',
            actorUserId: 'user-1',
            data: { totalCount: 100 },
        } as never);

        expect(result).toMatchObject({ ok: false, error: { status: 400 } });
        expect(await database.db.select().from(activityFeedItem).all()).toHaveLength(0);
    });

    it('records actorless system activity and permits a subject without a target', async () => {
        const result = await service.recordActivity({
            type: 'profile.birthday',
            subjectUserId: 'user-2',
            data: {},
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toMatchObject({
            type: 'profile.birthday',
            actorUserId: null,
            subjectUserId: 'user-2',
            targetType: null,
            targetId: null,
            data: {},
        });
    });

    it('records a calendar lifecycle event without requiring a user actor', async () => {
        const result = await service.recordActivity({
            type: 'calendar.event_started',
            target: { type: 'calendar.event', id: 'event-1' },
            data: { title: 'Game night' },
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toMatchObject({
            type: 'calendar.event_started',
            actorUserId: null,
            targetType: 'calendar.event',
            targetId: 'event-1',
        });
    });

    it('rejects unknown event types and malformed type-specific data', async () => {
        const unknownType = await service.recordActivity({
            type: 'unknown.action',
            data: {},
        } as never);
        const malformedData = await service.recordActivity({
            type: 'profile.updated',
            data: { changedFields: ['email'] },
        } as never);

        expect(unknownType).toMatchObject({ ok: false, error: { status: 400, code: 'BAD_REQUEST' } });
        expect(malformedData).toMatchObject({ ok: false, error: { status: 400, code: 'BAD_REQUEST' } });
    });

    it('returns newest visible activities first and paginates with a stable cursor', async () => {
        await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'user-1',
            subjectUserId: 'user-1',
            target: { type: 'platform.profile', id: 'user-1' },
            data: { changedFields: ['name'] },
            occurredAt: new Date('2026-10-28T12:00:00.000Z'),
        });
        await service.recordActivity({
            type: 'crewnow.image_posted',
            actorUserId: 'user-2',
            subjectUserId: 'user-1',
            target: { type: 'crewnow.post', id: 'post-1' },
            data: { imageFileId: 'file-1' },
            occurredAt: new Date('2026-10-28T13:00:00.000Z'),
        });
        await service.recordActivity({
            type: 'games.game_added',
            actorUserId: 'user-1',
            target: { type: 'games.library_entry', id: 'entry-1' },
            data: { gameId: 'game-1' },
            occurredAt: new Date('2026-10-28T14:00:00.000Z'),
        });

        const canView = async (_viewerId: string, activity: { targetId: string | null }) => activity.targetId !== 'post-1';
        const firstPage = await service.getFeed('viewer-1', { limit: 1 }, canView);

        expect(firstPage).toMatchObject({
            ok: true,
            value: {
                items: [{ type: 'games.game_added', targetId: 'entry-1' }],
                nextCursor: { occurredAt: new Date('2026-10-28T14:00:00.000Z') },
            },
        });
        if (!firstPage.ok || !firstPage.value.nextCursor) return;

        const secondPage = await service.getFeed('viewer-1', {
            limit: 1,
            before: firstPage.value.nextCursor,
        }, canView);

        expect(secondPage).toMatchObject({
            ok: true,
            value: { items: [{ type: 'profile.updated' }], nextCursor: null },
        });
    });

    it('uses the activity ID as a tie-breaker when multiple items share a timestamp', async () => {
        const occurredAt = new Date('2026-10-28T12:00:00.000Z');
        await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'user-1',
            subjectUserId: 'user-1',
            target: { type: 'platform.profile', id: 'user-1' },
            data: { changedFields: ['name'] },
            occurredAt,
        });
        await service.recordActivity({
            type: 'games.game_added',
            actorUserId: 'user-2',
            subjectUserId: 'user-2',
            target: { type: 'games.library_entry', id: 'entry-1' },
            data: { gameId: 'game-1' },
            occurredAt,
        });

        const all = await service.getFeed('viewer-1', { limit: 10 }, async () => true);
        expect(all.ok).toBe(true);
        if (!all.ok) return;
        expect(all.value.items).toHaveLength(2);

        const firstPage = await service.getFeed('viewer-1', { limit: 1 }, async () => true);
        expect(firstPage.ok).toBe(true);
        if (!firstPage.ok || !firstPage.value.nextCursor) return;

        const secondPage = await service.getFeed('viewer-1', {
            limit: 1,
            before: firstPage.value.nextCursor,
        }, async () => true);
        expect(secondPage.ok).toBe(true);
        if (!secondPage.ok) return;
        expect(secondPage.value.items).toHaveLength(1);
        expect(secondPage.value.items[0]?.id).not.toBe(firstPage.value.items[0]?.id);
    });

    it('rejects invalid target types and pagination cursors', async () => {
        const invalidTarget = await service.recordActivity({
            type: 'crewnow.image_posted',
            actorUserId: 'user-1',
            target: { type: 'post', id: 'post-1' },
            data: { imageFileId: 'file-1' },
        } as never);
        const mismatchedProfileTarget = await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'user-1',
            subjectUserId: 'user-1',
            target: { type: 'platform.profile', id: 'user-2' },
            data: { changedFields: ['name'] },
        });
        const invalidLimit = await service.getFeed('viewer-1', { limit: 0 }, async () => true);
        const invalidCursor = await service.getFeed('viewer-1', {
            before: { occurredAt: new Date(Number.NaN), id: 'item-1' },
        }, async () => true);

        expect(invalidTarget).toMatchObject({ ok: false, error: { status: 400 } });
        expect(mismatchedProfileTarget).toMatchObject({ ok: false, error: { status: 400 } });
        expect(invalidLimit).toMatchObject({ ok: false, error: { status: 400 } });
        expect(invalidCursor).toMatchObject({ ok: false, error: { status: 400 } });
    });

    it('does not return a target activity unless the owning app authorizes the viewer', async () => {
        await service.recordActivity({
            type: 'crewnow.image_posted',
            actorUserId: 'user-1',
            target: { type: 'crewnow.post', id: 'private-post' },
            data: { imageFileId: 'file-1' },
        });

        const result = await service.getFeed('viewer-2', { limit: 10 }, async () => false);

        expect(result).toEqual({ ok: true, value: { items: [], nextCursor: null } });
    });
});