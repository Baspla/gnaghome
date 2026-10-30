import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { ActivityFeedService } from '../../platform/activity-feed/service';
import { user } from '../../platform/users/schema';
import { FilesService } from '../../platform/files/service';
import { LocalFileStorage } from '../../platform/files/storage';
import { CrewNowService } from './service';
import { DiscussionsService } from '../../platform/discussions/service';

const PNG_BYTES = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pJ8AAAAASUVORK5CYII=',
    'base64',
));

describe('CrewNowService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let directory: string;
    let files: FilesService;
    let service: CrewNowService;
    let recordActivity: ReturnType<typeof mock>;
    let invalidateFeed: ReturnType<typeof mock>;
    let discussions: DiscussionsService;

    async function uploadImage(userId = 'user-1') {
        const result = await files.uploadFile(userId, PNG_BYTES);
        if (!result.ok) throw new Error(result.error.message);
        return result.value.id;
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        directory = await mkdtemp(join(tmpdir(), 'gnaghome-crewnow-'));
        files = new FilesService(database.db, new LocalFileStorage(directory));
        recordActivity = mock(async () => ok({}));
        invalidateFeed = mock(async () => {});
        const activityFeed = { recordActivity, invalidateFeed } as unknown as ActivityFeedService;
        discussions = new DiscussionsService(database.db, async () => ok(null));
        service = new CrewNowService(database.db, files, activityFeed, discussions);
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
            { id: 'user-3', name: 'Cara', email: 'cara@example.test' },
            { id: 'user-4', name: 'Drew', email: 'drew@example.test' },
            { id: 'user-5', name: 'Eli', email: 'eli@example.test' },
        ]);
    });

    afterEach(async () => {
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('creates a post with two images, optional caption, and validated tagged users', async () => {
        const backImageFileId = await uploadImage();
        const frontImageFileId = await uploadImage();

        const result = await service.createPost('user-1', {
            id: 'post-1',
            backImageFileId,
            frontImageFileId,
            caption: 'An afternoon together',
            taggedUserIds: ['user-2', 'user-3'],
        });

        expect(result).toMatchObject({
            ok: true,
            value: {
                id: 'post-1',
                caption: 'An afternoon together',
                author: { id: 'user-1', name: 'Alice' },
                taggedUsers: [{ id: 'user-2', name: 'Bob' }, { id: 'user-3', name: 'Cara' }],
            },
        });
        expect(recordActivity).toHaveBeenCalledTimes(1);
        expect(recordActivity.mock.calls[0]?.[0]).toMatchObject({
            type: 'crewnow.image_posted',
            actorUserId: 'user-1',
            target: { type: 'crewnow.post', id: 'post-1' },
            data: { imageFileId: backImageFileId },
        });
        const createdPost = result.ok ? result.value : null;
        expect(createdPost?.discussionId).toBeTruthy();
        if (createdPost?.discussionId) {
            expect(typeof createdPost.discussionId).toBe('string');
            expect(await discussions.getDiscussion(createdPost.discussionId)).toMatchObject({ ok: true, value: { targetType: 'crewnow.post', targetId: 'post-1' } });
        }
        expect(invalidateFeed).not.toHaveBeenCalled();
        expect((await files.getFile(backImageFileId, 'user-2')).ok).toBe(true);
        expect((await files.getFile(frontImageFileId, 'user-2')).ok).toBe(true);
    });

    it('returns the persisted discussion comment count with CrewNow post summaries', async () => {
        const created = await service.createPost('user-1', {
            id: 'post-comment-count',
            backImageFileId: await uploadImage(),
            frontImageFileId: await uploadImage(),
            caption: null,
            taggedUserIds: [],
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;

        expect(created.value.commentCount).toBe(0);
        expect(await discussions.createMessage(created.value.discussionId!, 'user-2', 'Eins'))
            .toMatchObject({ ok: true });
        expect(await discussions.createMessage(created.value.discussionId!, 'user-3', 'Zwei'))
            .toMatchObject({ ok: true });

        expect(await service.getPost('user-2', 'post-comment-count')).toMatchObject({
            ok: true,
            value: { discussionId: created.value.discussionId, commentCount: 2 },
        });
        expect(await service.getTimeline('user-2')).toMatchObject({
            ok: true,
            value: { items: [{ id: 'post-comment-count', commentCount: 2 }] },
        });
    });

    it('does not duplicate the post or activity when creation is retried with the same ID', async () => {
        const backImageFileId = await uploadImage();
        const frontImageFileId = await uploadImage();
        const input = { id: 'post-retry', backImageFileId, frontImageFileId, caption: null, taggedUserIds: [] };

        const first = await service.createPost('user-1', input);
        const retry = await service.createPost('user-1', input);

        expect(first.ok).toBe(true);
        expect(retry).toMatchObject({ ok: true, value: { id: 'post-retry', created: false } });
        expect(recordActivity).toHaveBeenCalledTimes(2);
    });

    it('does not let a different post attach images that are already attached to another post', async () => {
        const backImageFileId = await uploadImage();
        const frontImageFileId = await uploadImage();
        const first = await service.createPost('user-1', {
            id: 'post-original', backImageFileId, frontImageFileId, caption: null, taggedUserIds: [],
        });
        expect(first.ok).toBe(true);

        const reused = await service.createPost('user-1', {
            id: 'post-reused', backImageFileId, frontImageFileId, caption: null, taggedUserIds: [],
        });
        expect(reused).toMatchObject({ ok: false, error: { status: 409 } });
        expect(await service.getPost('user-1', 'post-reused')).toMatchObject({ ok: false, error: { status: 404 } });
    });

    it('rejects missing tagged users and does not make their private data observable', async () => {
        const result = await service.createPost('user-1', {
            id: 'bad-tag',
            backImageFileId: await uploadImage(),
            frontImageFileId: await uploadImage(),
            caption: null,
            taggedUserIds: ['does-not-exist'],
        });

        expect(result).toMatchObject({ ok: false, error: { status: 400 } });
        expect(recordActivity).not.toHaveBeenCalled();
    });

    it('allows only the author to edit caption and tags; an edit refreshes feed activity without adding another item', async () => {
        const post = await service.createPost('user-1', {
            id: 'post-edit',
            backImageFileId: await uploadImage(),
            frontImageFileId: await uploadImage(),
            caption: 'Before',
            taggedUserIds: ['user-2'],
        });
        expect(post.ok).toBe(true);

        const denied = await service.updatePost('user-2', 'post-edit', {
            caption: 'Not allowed',
            taggedUserIds: ['user-3'],
        });
        expect(denied).toMatchObject({ ok: false, error: { status: 403 } });

        const edited = await service.updatePost('user-1', 'post-edit', {
            caption: 'After',
            taggedUserIds: ['user-3', 'user-4'],
        });
        expect(edited).toMatchObject({
            ok: true,
            value: { caption: 'After', taggedUsers: [{ id: 'user-3' }, { id: 'user-4' }] },
        });
        expect(recordActivity).toHaveBeenCalledTimes(1);
        expect(invalidateFeed).toHaveBeenCalledTimes(1);
    });

    it('returns a chronological cursor-paginated timeline and a post by ID to any signed-in viewer', async () => {
        for (const id of ['post-a', 'post-b', 'post-c']) {
            const result = await service.createPost('user-1', {
                id,
                backImageFileId: await uploadImage(),
                frontImageFileId: await uploadImage(),
                caption: null,
                taggedUserIds: [],
            });
            expect(result.ok).toBe(true);
        }

        const firstPage = await service.getTimeline('user-2', { limit: 2 });
        expect(firstPage.ok).toBe(true);
        if (!firstPage.ok) return;
        expect(firstPage.value.items).toHaveLength(2);
        expect(firstPage.value.nextCursor).not.toBeNull();

        const secondPage = await service.getTimeline('user-2', {
            limit: 2,
            before: firstPage.value.nextCursor ?? undefined,
        });
        expect(secondPage).toMatchObject({ ok: true, value: { items: [{ id: 'post-a' }], nextCursor: null } });
        expect(await service.getPost('user-2', 'post-b')).toMatchObject({ ok: true, value: { id: 'post-b' } });
    });

    it('allows only the author to delete a post and removes its image files', async () => {
        const backImageFileId = await uploadImage();
        const frontImageFileId = await uploadImage();
        await service.createPost('user-1', {
            id: 'post-delete', backImageFileId, frontImageFileId, caption: null, taggedUserIds: [],
        });
        const post = await service.getPost('user-1', 'post-delete');
        expect(post.ok).toBe(true);
        const discussionId = post.ok ? post.value.discussionId : null;

        expect(await service.deletePost('user-2', 'post-delete')).toMatchObject({ ok: false, error: { status: 403 } });
        expect(await service.deletePost('user-1', 'post-delete')).toEqual({ ok: true, value: null });
        expect(await service.getPost('user-2', 'post-delete')).toMatchObject({ ok: false, error: { status: 404 } });
        expect(await files.getFile(backImageFileId, 'user-1')).toMatchObject({ ok: false });
        expect(await files.getFile(frontImageFileId, 'user-1')).toMatchObject({ ok: false });
        expect(invalidateFeed).toHaveBeenCalledTimes(1);
        if (discussionId) expect(await discussions.getDiscussion(discussionId)).toMatchObject({ ok: false, error: { status: 404 } });
    });

    it('discards only the authenticated user’s unreferenced pending upload', async () => {
        const pending = await uploadImage();
        const otherUserUpload = await uploadImage('user-2');
        expect(await service.discardPendingUpload('user-1', pending)).toEqual({ ok: true, value: null });
        expect(await files.getFile(pending, 'user-1')).toMatchObject({ ok: false });
        expect(await service.discardPendingUpload('user-1', otherUserUpload)).toMatchObject({ ok: false, error: { status: 403 } });
    });

    it('does not discard a pending image once a post references it', async () => {
        const backImageFileId = await uploadImage();
        const frontImageFileId = await uploadImage();
        await service.createPost('user-1', {
            id: 'post-attached', backImageFileId, frontImageFileId, caption: null, taggedUserIds: [],
        });
        expect(await service.discardPendingUpload('user-1', backImageFileId)).toMatchObject({
            ok: false,
            error: { status: 409 },
        });
        expect((await files.getFile(backImageFileId, 'user-2')).ok).toBe(true);
    });
});