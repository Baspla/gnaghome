import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { user } from '../users/schema';
import { ReactionsService } from './service';

describe('ReactionsService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let broadcast: ReturnType<typeof mock>;
    let service: ReactionsService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
        broadcast = mock(async () => ({ ok: true as const, value: null }));
        service = new ReactionsService(database.db, broadcast, undefined, async (name) => name === 'party_blob');
    });

    afterEach(() => database.close());

    it('creates a reaction, replaces it with another emoji, and toggles the same emoji off', async () => {
        const first = await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '❤️');
        expect(first).toMatchObject({ ok: true, value: { changed: true, reaction: { emoji: '❤️' } } });

        const replacement = await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '😂');
        expect(replacement).toMatchObject({ ok: true, value: { changed: true, reaction: { emoji: '😂' } } });

        const removed = await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '😂');
        expect(removed).toMatchObject({ ok: true, value: { changed: true, reaction: null } });
        expect(await service.getReactions('crewnow.post', 'post-1', 'user-1')).toMatchObject({
            ok: true,
            value: { count: 0, viewerReaction: null, items: [] },
        });
        expect(broadcast.mock.calls.map((call) => call[1])).toMatchObject([
            { type: 'reaction.changed', action: 'CREATED', entityId: 'crewnow.post:post-1' },
            { type: 'reaction.changed', action: 'UPDATED', entityId: 'crewnow.post:post-1' },
            { type: 'reaction.changed', action: 'DELETED', entityId: 'crewnow.post:post-1' },
        ]);
    });

    it('limits a user to one reaction per target but allows other users and targets', async () => {
        await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '🔥');
        await service.toggleReaction('crewnow.post', 'post-1', 'user-2', '🎉');
        await service.toggleReaction('crewnow.post', 'post-2', 'user-1', '👀');

        const collection = await service.getReactions('crewnow.post', 'post-1', 'user-1');
        expect(collection.ok).toBe(true);
        if (!collection.ok) return;
        expect(collection.value.count).toBe(2);
        expect(collection.value.viewerReaction).toBe('🔥');
        expect(collection.value.items.map(({ emoji, user: person }) => ({ emoji, user: person }))).toEqual(expect.arrayContaining([
            { emoji: '🔥', user: { id: 'user-1', name: 'Alice', image: null } },
            { emoji: '🎉', user: { id: 'user-2', name: 'Bob', image: null } },
        ]));
        expect(await service.getCounts('crewnow.post', ['post-1', 'post-2', 'missing']))
            .toEqual({ 'post-1': 2, 'post-2': 1 });
    });

    it('returns one sampled emoji per target and omits targets without reactions', async () => {
        await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '❤️');
        await service.toggleReaction('crewnow.post', 'post-1', 'user-2', '🔥');
        await service.toggleReaction('crewnow.post', 'post-2', 'user-1', '🎉');

        const sampled = await service.getRandomReactionEmojis('crewnow.post', ['post-1', 'post-2', 'post-3']);
        expect(['❤️', '🔥']).toContain(sampled['post-1']);
        expect(sampled['post-2']).toBe('🎉');
        expect(sampled).not.toHaveProperty('post-3');
    });

    it('accepts known custom emoji tokens and rejects unknown tokens or non-emoji text', async () => {
        expect(await service.toggleReaction('crewnow.post', 'post-1', 'user-1', ':party_blob:'))
            .toMatchObject({ ok: true, value: { reaction: { emoji: ':party_blob:' } } });
        expect(await service.toggleReaction('crewnow.post', 'post-2', 'user-1', ':missing:'))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.toggleReaction('crewnow.post', 'post-2', 'user-1', 'hello'))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.toggleReaction('crewnow.post', 'post-3', 'user-1', '🇩🇪'))
            .toMatchObject({ ok: true, value: { reaction: { emoji: '🇩🇪' } } });
        expect(await service.toggleReaction('crewnow.post', 'post-4', 'user-1', '1️⃣'))
            .toMatchObject({ ok: true, value: { reaction: { emoji: '1️⃣' } } });
        expect(await service.toggleReaction('crewnow.post', 'post-5', 'user-1', '❤️😂'))
            .toMatchObject({ ok: false, error: { status: 400 } });
    });

    it('calls the creation hook only for the initial reaction, not replacements or removals', async () => {
        const onCreated = mock(async () => {});
        service = new ReactionsService(database.db, broadcast, undefined, async () => false, onCreated);

        await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '❤️');
        await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '🔥');
        await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '🔥');

        expect(onCreated).toHaveBeenCalledTimes(1);
        expect(onCreated).toHaveBeenCalledWith({ targetType: 'crewnow.post', targetId: 'post-1' }, 'user-1');
    });

    it('validates namespaced targets and removes all reactions for a deleted target', async () => {
        expect(await service.toggleReaction('bad target', 'post-1', 'user-1', '❤️'))
            .toMatchObject({ ok: false, error: { status: 400 } });
        await service.toggleReaction('crewnow.post', 'post-1', 'user-1', '❤️');
        expect(await service.deleteTargetReactions('crewnow.post', 'post-1')).toBe(1);
        expect(await service.getReactions('crewnow.post', 'post-1', 'user-1'))
            .toMatchObject({ ok: true, value: { count: 0, items: [] } });
    });
});