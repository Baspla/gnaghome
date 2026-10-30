import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { err, ok } from '../../lib/result';
import { user } from '../users/schema';
import { createAuthMiddleware } from '../auth';
import type { UserService } from '../users/service';
import { ActivityFeedService } from './service';
import { createActivityFeedModule } from './module';
import type { CrewNowService } from '../../apps/crewnow/service';
import { DiscussionsService } from '../discussions/service';

describe('activity feed HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let service: ActivityFeedService;
    let session: { user: { id: string; createdAt: Date; updatedAt: Date; name: string; email: string; emailVerified: boolean; groups: string; image: string | null }; session: { id: string } } | null;
    let canViewUser: (viewerId: string, targetUserId: string) => boolean;
    let currentPostTags = [{ id: 'tag-1', name: 'Tag One', image: null }];
    let postExists = true;
    let discussions: DiscussionsService;
    let discussionId = '';

    const getUserAsUser: UserService['getUserAsUser'] = async (viewerId, targetUserId) => {
        if (!canViewUser(viewerId, targetUserId)) {
            return err({ status: 404, code: 'NOT_FOUND', message: 'User not found' });
        }
        const profile = await database.db.select().from(user).where(eq(user.id, targetUserId)).get();
        if (!profile) return err({ status: 404, code: 'NOT_FOUND', message: 'User not found' });
        return ok(profile);
    };

    function app() {
        const auth = createAuthMiddleware(
            async () => session,
            async () => new Response('auth handler'),
        );
        const crewNowService: Pick<CrewNowService, 'getPostForActivity' | 'getActivityTaggedUsers' | 'getTagIdsForPost'> = {
            getPostForActivity: async (_viewerId, postId) => postId === 'post-1' && postExists
                ? ok({ id: postId, taggedUsers: currentPostTags } as never)
                : err({ status: 404, code: 'NOT_FOUND', message: 'Post not found' }),
            getActivityTaggedUsers: async (_viewerId, ids) => currentPostTags.filter((person) => ids.includes(person.id)),
            getTagIdsForPost: async () => currentPostTags.map((person) => person.id),
        };
        return new Elysia().use(createActivityFeedModule(auth, service, { getUserAsUser }, crewNowService, {
            getMessageCounts: (ids) => discussions.getMessageCounts(ids),
        }));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'viewer-1', name: 'Viewer', email: 'viewer@example.test' },
            { id: 'actor-1', name: 'Alice', email: 'alice@example.test', image: 'https://example.test/alice.png' },
            { id: 'subject-1', name: 'Bob', email: 'bob@example.test' },
            { id: 'private-1', name: 'Private User', email: 'private@example.test' },
        ]);
        service = new ActivityFeedService(database.db, async () => ok(null));
        discussions = new DiscussionsService(database.db, async () => ok(null));
        const createdDiscussion = await discussions.getOrCreateDiscussion('crewnow.post', 'post-1');
        if (!createdDiscussion.ok) throw new Error('discussion setup failed');
        discussionId = createdDiscussion.value.id;
        session = {
            user: {
                id: 'viewer-1',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                name: 'Viewer',
                email: 'viewer@example.test',
                emailVerified: true,
                groups: '[]',
                image: null,
            },
            session: { id: 'session-1' },
        };
        canViewUser = (_viewerId, targetUserId) => targetUserId !== 'private-1';
        currentPostTags = [{ id: 'tag-1', name: 'Tag One', image: null }];
        postExists = true;
    });

    afterEach(() => database.close());

    it('requires authentication to read the feed', async () => {
        session = null;
        const response = await app().handle(new Request('http://localhost/activity-feed'));

        expect(response.status).toBe(401);
    });

    it('returns authorized profile and CrewNow activities with public actor and live tagged users', async () => {
        await discussions.createMessage(discussionId, 'actor-1', 'Kommentar eins');
        await discussions.createMessage(discussionId, 'subject-1', 'Kommentar zwei');
        await discussions.createMessage(discussionId, 'viewer-1', 'Kommentar drei');
        await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'actor-1',
            subjectUserId: 'subject-1',
            target: { type: 'platform.profile', id: 'subject-1' },
            data: { changedFields: ['name'] },
            occurredAt: new Date('2026-10-28T12:00:00.000Z'),
        });
        await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'actor-1',
            subjectUserId: 'private-1',
            target: { type: 'platform.profile', id: 'private-1' },
            data: { changedFields: ['image'] },
            occurredAt: new Date('2026-10-28T13:00:00.000Z'),
        });
        await service.recordActivity({
            type: 'crewnow.image_posted',
            actorUserId: 'actor-1',
            target: { type: 'crewnow.post', id: 'post-1' },
            discussionId,
            data: { imageFileId: 'file-1' },
            occurredAt: new Date('2026-10-28T14:00:00.000Z'),
        });

        const response = await app().handle(new Request('http://localhost/activity-feed?limit=10'));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            items: [{
                type: 'crewnow.image_posted',
                actor: { id: 'actor-1', name: 'Alice', image: 'https://example.test/alice.png' },
                data: { imageFileId: 'file-1', taggedUsers: [{ id: 'tag-1', name: 'Tag One', image: null }] },
                discussionId,
                commentCount: 3,
            }, {
                type: 'profile.updated',
                actor: { id: 'actor-1', name: 'Alice', image: 'https://example.test/alice.png' },
                subject: { id: 'subject-1', name: 'Bob', image: null },
                target: { type: 'platform.profile', id: 'subject-1' },
                data: { changedFields: ['name'] },
            }],
            nextCursor: null,
        });
        expect(JSON.stringify(body)).not.toContain('private-1');
        expect(JSON.stringify(body)).toContain('crewnow.post');
        expect(JSON.stringify(body)).not.toContain('alice@example.test');
    });

    it('resolves current post tags on every activity feed read and omits deleted posts', async () => {
        await service.recordActivity({
            type: 'crewnow.image_posted',
            actorUserId: 'actor-1',
            target: { type: 'crewnow.post', id: 'post-1' },
            discussionId,
            data: { imageFileId: 'file-1' },
        });

        const firstResponse = await app().handle(new Request('http://localhost/activity-feed?limit=10'));
        const first = await firstResponse.json() as { items: Array<{ data: { taggedUsers?: Array<{ id: string }> } }> };
        expect(first.items[0]?.data.taggedUsers?.map((tag) => tag.id)).toEqual(['tag-1']);

        currentPostTags = [{ id: 'tag-2', name: 'Tag Two', image: null }, { id: 'tag-3', name: 'Tag Three', image: null }];
        const editedResponse = await app().handle(new Request('http://localhost/activity-feed?limit=10'));
        const edited = await editedResponse.json() as { items: Array<{ data: { taggedUsers?: Array<{ id: string }> } }> };
        expect(edited.items[0]?.data.taggedUsers?.map((tag) => tag.id)).toEqual(['tag-2', 'tag-3']);

        postExists = false;
        const deletedResponse = await app().handle(new Request('http://localhost/activity-feed?limit=10'));
        expect(await deletedResponse.json()).toMatchObject({ items: [], nextCursor: null });
    });

    it('paginates authorized activity in the URL cursor format', async () => {
        await service.recordActivity({
            type: 'profile.updated',
            actorUserId: 'actor-1',
            subjectUserId: 'subject-1',
            target: { type: 'platform.profile', id: 'subject-1' },
            data: { changedFields: ['name'] },
            occurredAt: new Date('2026-10-28T12:00:00.000Z'),
        });
        await service.recordActivity({
            type: 'profile.birthday',
            subjectUserId: 'subject-1',
            data: {},
            occurredAt: new Date('2026-10-28T13:00:00.000Z'),
        });

        const firstResponse = await app().handle(new Request('http://localhost/activity-feed?limit=1'));
        const firstPage = await firstResponse.json();
        expect(firstResponse.status).toBe(200);
        expect(firstPage.items).toHaveLength(1);
        expect(firstPage.nextCursor).toBeTruthy();

        const cursor = firstPage.nextCursor as { id: string; occurredAt: string };
        expect(typeof cursor.id).toBe('string');
        expect(typeof cursor.occurredAt).toBe('string');
        const secondResponse = await app().handle(new Request(
            `http://localhost/activity-feed?limit=1&beforeOccurredAt=${encodeURIComponent(cursor.occurredAt)}&beforeId=${encodeURIComponent(cursor.id)}`,
        ));
        const secondPage = await secondResponse.json();
        expect(secondResponse.status).toBe(200);
        expect(secondPage.items).toHaveLength(1);
        expect(secondPage.items[0].type).toBe('profile.updated');
        expect(secondPage.nextCursor).toBeNull();
    });

    it('rejects malformed pagination queries', async () => {
        const response = await app().handle(new Request('http://localhost/activity-feed?limit=0'));
        const invalidCursor = await app().handle(new Request(
            'http://localhost/activity-feed?beforeOccurredAt=not-a-date&beforeId=item-1',
        ));

        expect(response.status).toBe(422);
        expect(invalidCursor.status).toBe(400);
    });
});