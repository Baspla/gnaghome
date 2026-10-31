import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { user } from '../users/schema';
import { DiscussionsService } from './service';
import { discussionMessage } from './schema';

describe('DiscussionsService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: DiscussionsService;
    let broadcast: ReturnType<typeof mock>;
    let notifications: { notifyUsers: ReturnType<typeof mock> };
    let discussionId: string;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
            { id: 'user-3', name: 'Cara', email: 'cara@example.test' },
        ]);
        broadcast = mock(async () => ok(null));
        notifications = { notifyUsers: mock(async () => {}) };
        service = new DiscussionsService(database.db, broadcast, notifications, async (_targetType, targetId) =>
            targetId === 'post-1' ? 'user-1' : null);
        const createdDiscussion = await service.getOrCreateDiscussion('crewnow.post', 'post-1');
        expect(createdDiscussion.ok).toBe(true);
        if (!createdDiscussion.ok) throw new Error('discussion setup failed');
        discussionId = createdDiscussion.value.id;
    });

    afterEach(() => database.close());

    it('creates one canonical discussion per target, including concurrent retries', async () => {
        const [first, second] = await Promise.all([
            service.getOrCreateDiscussion('crewnow.post', 'post-2'),
            service.getOrCreateDiscussion('crewnow.post', 'post-2'),
        ]);

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok) return;
        expect(first.value.id).toBe(second.value.id);
        expect(first.value.targetType).toBe('crewnow.post');
        expect(first.value.targetId).toBe('post-2');
    });

    it('deletes a discussion and cascades its messages', async () => {
        const message = await service.createMessage(discussionId, 'user-1', 'Wird entfernt');
        expect(message.ok).toBe(true);
        expect(await service.deleteDiscussion(discussionId)).toMatchObject({ ok: true, value: null });
        expect(await service.getDiscussion(discussionId)).toMatchObject({ ok: false, error: { status: 404 } });
        expect(await database.db.select().from(discussionMessage)).toHaveLength(0);
    });

    it('persists comments and edited timestamps, and broadcasts only discussion invalidations', async () => {
        const created = await service.createMessage(discussionId, 'user-1', 'Hallo zusammen');
        expect(created).toMatchObject({
            ok: true,
            value: { body: 'Hallo zusammen', author: { id: 'user-1', name: 'Alice' }, editedAt: null },
        });
        expect(broadcast).toHaveBeenCalledTimes(2);
        expect(broadcast.mock.calls[0]?.[0]).toEqual(['public:discussions']);
        expect(broadcast.mock.calls[0]?.[1]).toMatchObject({
            type: 'discussion.changed',
            data: {},
        });
        expect(JSON.stringify(broadcast.mock.calls[0]?.[1])).not.toContain(discussionId);
        expect(JSON.stringify(broadcast.mock.calls[0]?.[1])).not.toContain('Hallo zusammen');

        const edited = created.ok
            ? await service.editMessage(created.value.id, 'user-1', 'Aktualisierter Kommentar')
            : created;
        expect(edited).toMatchObject({ ok: true, value: { body: 'Aktualisierter Kommentar' } });
        if (edited.ok) expect(edited.value.editedAt).toBeInstanceOf(Date);
        expect(broadcast).toHaveBeenCalledTimes(4);

        const messages = await service.getMessages(discussionId, 'user-1');
        expect(messages).toMatchObject({ ok: true, value: [{ body: 'Aktualisierter Kommentar', editedAt: expect.any(Date) }] });
        if (messages.ok) expect(await service.getMessageCounts([discussionId])).toEqual({ [discussionId]: 1 });
    });

    it('allows any authenticated user to comment but restricts edits and deletion to the author', async () => {
        const created = await service.createMessage(discussionId, 'user-1', 'Eigener Kommentar');
        expect(created.ok).toBe(true);
        if (!created.ok) return;

        expect(await service.editMessage(created.value.id, 'user-2', 'Fremde Bearbeitung'))
            .toMatchObject({ ok: false, error: { status: 403 } });
        expect(await service.deleteMessage(created.value.id, 'user-2'))
            .toMatchObject({ ok: false, error: { status: 403 } });
        expect(await service.createMessage(discussionId, 'user-2', 'Antwort'))
            .toMatchObject({ ok: true, value: { body: 'Antwort', author: { id: 'user-2' } } });
        expect(await service.deleteMessage(created.value.id, 'user-1')).toMatchObject({ ok: true, value: null });
        expect(await service.getMessages(discussionId, 'user-2')).toMatchObject({ ok: true, value: [{ body: 'Antwort' }] });
        const remainingMessages = await service.getMessages(discussionId, 'user-2');
        expect(remainingMessages.ok).toBe(true);
        if (!remainingMessages.ok) return;
        expect(await service.deleteMessage(remainingMessages.value[0]!.id, 'user-2')).toMatchObject({ ok: true, value: null });
        expect(await service.getMessageCounts([discussionId])).toEqual({});
    });

    it('rejects blank and oversized comments without writing or broadcasting', async () => {
        expect(await service.createMessage(discussionId, 'user-1', ' \n '))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.createMessage(discussionId, 'user-1', 'x'.repeat(5001)))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(broadcast).not.toHaveBeenCalled();
        expect(await database.db.select().from(discussionMessage)).toHaveLength(0);
    });

    it('notifies a post owner and prior discussion participants only for newly created messages', async () => {
        await service.createMessage(discussionId, 'user-2', 'Erster Kommentar');
        expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
        expect(notifications.notifyUsers.mock.calls[0]?.[0]).toBe('discussions.post-comment');
        expect(notifications.notifyUsers.mock.calls[0]?.[1]).toEqual(['user-1']);

        const ownerReply = await service.createMessage(discussionId, 'user-1', 'Antwort des Autors');
        expect(ownerReply.ok).toBe(true);
        expect(notifications.notifyUsers).toHaveBeenCalledTimes(2);
        expect(notifications.notifyUsers.mock.calls[1]?.[0]).toBe('discussions.new-message');
        expect(notifications.notifyUsers.mock.calls[1]?.[1]).toEqual(['user-2']);

        const participantReply = await service.createMessage(discussionId, 'user-3', 'Noch ein Kommentar');
        expect(participantReply.ok).toBe(true);
        expect(notifications.notifyUsers).toHaveBeenCalledTimes(4);
        expect(notifications.notifyUsers.mock.calls[2]?.[0]).toBe('discussions.post-comment');
        expect(notifications.notifyUsers.mock.calls[3]?.[0]).toBe('discussions.new-message');
        expect(notifications.notifyUsers.mock.calls[3]?.[1]).toEqual(['user-2']);

        if (participantReply.ok) {
            await service.editMessage(participantReply.value.id, 'user-3', 'Bearbeitet');
        }
        expect(notifications.notifyUsers).toHaveBeenCalledTimes(4);
    });
});