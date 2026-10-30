import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, like, lt, ne, or } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import {
    err,
    ok,
    type BadRequestError,
    type ConflictError,
    type ForbiddenError,
    type InternalError,
    type NotFoundError,
    type Result,
} from '../../lib/result';
import type { ActivityFeedService } from '../../platform/activity-feed/service';
import type { FilesService } from '../../platform/files/service';
import { user } from '../../platform/users/schema';
import { crewNowPost, crewNowPostTag, type CrewNowPost } from './schema';
import type { DiscussionsService } from '../../platform/discussions/service';

export type CrewNowUserSummary = { id: string; name: string; image: string | null };

export type CrewNowPostSummary = {
    id: string;
    discussionId: string | null;
    commentCount: number;
    author: CrewNowUserSummary;
    backImage: { id: string; url: string };
    frontImage: { id: string; url: string };
    caption: string | null;
    taggedUsers: CrewNowUserSummary[];
    createdAt: Date;
    updatedAt: Date;
    canEdit: boolean;
};

export type CrewNowCursor = { createdAt: Date; id: string };
export type CrewNowTimeline = { items: CrewNowPostSummary[]; nextCursor: CrewNowCursor | null };

type CreatePostInput = {
    id: string;
    backImageFileId: string;
    frontImageFileId: string;
    caption: string | null;
    taggedUserIds: string[];
};

type UpdatePostInput = { caption: string | null; taggedUserIds: string[] };

type CrewNowError = BadRequestError | ConflictError | ForbiddenError | InternalError | NotFoundError;

function validId(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function validateCaption(caption: unknown): caption is string | null {
    return caption === null || (typeof caption === 'string' && caption.length <= 500);
}

function validateTags(ids: unknown): ids is string[] {
    return Array.isArray(ids)
        && ids.length <= 50
        && ids.every(validId)
        && new Set(ids).size === ids.length;
}

export class CrewNowService {
    constructor(
        private readonly db: AppDatabase,
        private readonly files: Pick<FilesService, 'getFile' | 'getOwnedPendingUpload' | 'finalizeUpload' | 'deleteFile' | 'discardPendingUpload'>,
        private readonly activityFeed: Pick<ActivityFeedService, 'recordActivity' | 'invalidateFeed'>,
        private readonly discussions: Pick<DiscussionsService, 'getOrCreateDiscussion' | 'deleteDiscussion' | 'getMessageCounts'>,
    ) {}

    private async getTaggedUsers(postId: string): Promise<CrewNowUserSummary[]> {
        const rows = await this.db.select({
            id: user.id,
            name: user.name,
            image: user.image,
        })
            .from(crewNowPostTag)
            .innerJoin(user, eq(user.id, crewNowPostTag.taggedUserId))
            .where(eq(crewNowPostTag.postId, postId))
            .orderBy(crewNowPostTag.position);
        return rows;
    }

    private async resolvePost(post: CrewNowPost, viewerUserId: string, commentCount?: number): Promise<CrewNowPostSummary | null> {
        const [author] = await this.db.select({ id: user.id, name: user.name, image: user.image })
            .from(user)
            .where(eq(user.id, post.authorUserId))
            .limit(1);
        if (!author) return null;
        const commentCounts = commentCount !== undefined ? null : post.discussionId
            ? await this.discussions.getMessageCounts([post.discussionId])
            : {};
        return {
            id: post.id,
            discussionId: post.discussionId,
            commentCount: commentCount ?? (post.discussionId && commentCounts ? commentCounts[post.discussionId] ?? 0 : 0),
            author,
            backImage: { id: post.backImageFileId, url: `/api/v1/files/${post.backImageFileId}` },
            frontImage: { id: post.frontImageFileId, url: `/api/v1/files/${post.frontImageFileId}` },
            caption: post.caption,
            taggedUsers: await this.getTaggedUsers(post.id),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            canEdit: viewerUserId === post.authorUserId,
        };
    }

    private async validateTaggedUsers(ids: string[], authorUserId: string): Promise<boolean> {
        if (ids.includes(authorUserId)) return false;
        if (ids.length === 0) return true;
        const matches = await this.db.select({ id: user.id }).from(user).where(inArray(user.id, ids));
        return matches.length === ids.length;
    }

    async searchUsers(query: string, limit = 20, excludeUserId?: string): Promise<Result<CrewNowUserSummary[], BadRequestError | InternalError>> {
        const normalized = query.trim().slice(0, 80);
        if (!Number.isInteger(limit) || limit < 1) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Suchanfrage.' });
        }
        try {
            const rows = await this.db.select({ id: user.id, name: user.name, image: user.image })
                .from(user)
                .where(and(
                    normalized ? like(user.name, `%${normalized.replace(/[\\%_]/g, '\\$&')}%`) : undefined,
                    excludeUserId ? ne(user.id, excludeUserId) : undefined,
                ))
                .orderBy(user.name)
                .limit(Math.min(limit, 50));
            return ok(rows);
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Personen konnten nicht geladen werden.' });
        }
    }

    async createPost(authorUserId: string, input: CreatePostInput): Promise<Result<CrewNowPostSummary & { created: boolean }, CrewNowError>> {
        if (!validId(input.id)
            || !validId(input.backImageFileId)
            || !validId(input.frontImageFileId)
            || !validateCaption(input.caption)
            || !validateTags(input.taggedUserIds)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Die Postdaten sind ungültig.' });
        }
        if (input.backImageFileId === input.frontImageFileId) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Für beide Kameras werden separate Bilder benötigt.' });
        }

        try {
            const [existing] = await this.db.select().from(crewNowPost).where(eq(crewNowPost.id, input.id)).limit(1);
            if (existing) {
                if (existing.authorUserId !== authorUserId) {
                    return err({ status: 409, code: 'CONFLICT', message: 'Diese Post-ID ist bereits vergeben.' });
                }
                const existingTags = (await this.getTaggedUsers(existing.id)).map((tag) => tag.id);
                if (existing.backImageFileId !== input.backImageFileId
                    || existing.frontImageFileId !== input.frontImageFileId
                    || existing.caption !== input.caption
                    || existingTags.join('\0') !== input.taggedUserIds.join('\0')) {
                    return err({ status: 409, code: 'CONFLICT', message: 'Dieser Post wurde bereits mit anderen Daten erstellt.' });
                }
                const summary = await this.resolvePost(existing, authorUserId);
                if (!summary) return err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
                let discussionId = existing.discussionId;
                if (!discussionId) {
                    const discussionResult = await this.discussions.getOrCreateDiscussion('crewnow.post', existing.id);
                    if (!discussionResult.ok) return err(discussionResult.error);
                    discussionId = discussionResult.value.id;
                    await this.db.update(crewNowPost).set({ discussionId }).where(eq(crewNowPost.id, existing.id));
                }
                const activity = await this.activityFeed.recordActivity({
                    type: 'crewnow.image_posted',
                    actorUserId: authorUserId,
                    target: { type: 'crewnow.post', id: existing.id },
                    discussionId,
                    data: { imageFileId: existing.backImageFileId },
                    occurredAt: existing.createdAt,
                });
                if (!activity.ok) return err(activity.error);
                return ok({ ...summary, created: false });
            }

            const [attachedImage] = await this.db.select({ id: crewNowPost.id })
                .from(crewNowPost)
                .where(or(
                    eq(crewNowPost.backImageFileId, input.backImageFileId),
                    eq(crewNowPost.frontImageFileId, input.backImageFileId),
                    eq(crewNowPost.backImageFileId, input.frontImageFileId),
                    eq(crewNowPost.frontImageFileId, input.frontImageFileId),
                ))
                .limit(1);
            if (attachedImage) {
                return err({ status: 409, code: 'CONFLICT', message: 'Mindestens eines der Bilder gehört bereits zu einem anderen Post.' });
            }
            if (!(await this.validateTaggedUsers(input.taggedUserIds, authorUserId))) {
                return err({ status: 400, code: 'BAD_REQUEST', message: 'Mindestens eine markierte Person wurde nicht gefunden.' });
            }
            for (const fileId of [input.backImageFileId, input.frontImageFileId]) {
                const file = await this.files.getOwnedPendingUpload(fileId, authorUserId);
                if (!file.ok) return err(file.error);
            }

            const discussionResult = await this.discussions.getOrCreateDiscussion('crewnow.post', input.id);
            if (!discussionResult.ok) return err(discussionResult.error);

            const post: CrewNowPost = {
                id: input.id,
                authorUserId,
                backImageFileId: input.backImageFileId,
                frontImageFileId: input.frontImageFileId,
                discussionId: discussionResult.value.id,
                caption: input.caption,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await this.db.transaction(async (tx) => {
                await tx.insert(crewNowPost).values(post);
                if (input.taggedUserIds.length > 0) {
                    await tx.insert(crewNowPostTag).values(input.taggedUserIds.map((taggedUserId, position) => ({
                        postId: post.id,
                        taggedUserId,
                        position,
                    })));
                }
            });

            const finalizedBack = await this.files.finalizeUpload(input.backImageFileId, authorUserId, false);
            const finalizedFront = finalizedBack.ok
                ? await this.files.finalizeUpload(input.frontImageFileId, authorUserId, false)
                : finalizedBack;
            if (!finalizedBack.ok || !finalizedFront.ok) {
                await this.db.delete(crewNowPost).where(eq(crewNowPost.id, post.id));
                await this.discussions.deleteDiscussion(discussionResult.value.id);
                await Promise.all([input.backImageFileId, input.frontImageFileId].map((fileId) => this.files.deleteFile(fileId)));
                if (!finalizedBack.ok) return err(finalizedBack.error);
                if (!finalizedFront.ok) return err(finalizedFront.error);
            }

            const recorded = await this.activityFeed.recordActivity({
                type: 'crewnow.image_posted',
                actorUserId: authorUserId,
                target: { type: 'crewnow.post', id: post.id },
                discussionId: discussionResult.value.id,
                data: { imageFileId: post.backImageFileId },
                occurredAt: post.createdAt,
            });
            if (!recorded.ok) return err(recorded.error);
            const summary = await this.resolvePost(post, authorUserId);
            if (!summary) return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Post konnte nicht geladen werden.' });
            return ok({ ...summary, created: true });
        } catch (error) {
            if (String(error).includes('UNIQUE') || String(error).includes('constraint')) {
                return err({ status: 409, code: 'CONFLICT', message: 'Ein Post mit dieser ID existiert bereits.' });
            }
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Post konnte nicht erstellt werden.' });
        }
    }

    async updatePost(authorUserId: string, postId: string, input: UpdatePostInput): Promise<Result<CrewNowPostSummary, CrewNowError>> {
        if (!validId(postId) || !validateCaption(input.caption) || !validateTags(input.taggedUserIds)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Die Änderungen sind ungültig.' });
        }
        try {
            const [post] = await this.db.select().from(crewNowPost).where(eq(crewNowPost.id, postId)).limit(1);
            if (!post) return err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
            if (post.authorUserId !== authorUserId) return err({ status: 403, code: 'FORBIDDEN', message: 'Du kannst nur eigene Posts bearbeiten.' });
            if (!(await this.validateTaggedUsers(input.taggedUserIds, authorUserId))) {
                return err({ status: 400, code: 'BAD_REQUEST', message: 'Mindestens eine markierte Person wurde nicht gefunden.' });
            }

            await this.db.transaction(async (tx) => {
                await tx.update(crewNowPost).set({ caption: input.caption, updatedAt: new Date() })
                    .where(eq(crewNowPost.id, postId));
                await tx.delete(crewNowPostTag).where(eq(crewNowPostTag.postId, postId));
                if (input.taggedUserIds.length > 0) {
                    await tx.insert(crewNowPostTag).values(input.taggedUserIds.map((taggedUserId, position) => ({
                        postId,
                        taggedUserId,
                        position,
                    })));
                }
            });
            await this.activityFeed.invalidateFeed();
            const [updated] = await this.db.select().from(crewNowPost).where(eq(crewNowPost.id, postId)).limit(1);
            if (!updated) return err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
            const summary = await this.resolvePost(updated, authorUserId);
            return summary ? ok(summary) : err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
        } catch (error) {
            console.error('CrewNow update failed', error);
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Post konnte nicht gespeichert werden.' });
        }
    }

    async deletePost(authorUserId: string, postId: string): Promise<Result<null, CrewNowError>> {
        if (!validId(postId)) return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Post-ID.' });
        try {
            const [post] = await this.db.select().from(crewNowPost).where(eq(crewNowPost.id, postId)).limit(1);
            if (!post) return err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
            if (post.authorUserId !== authorUserId) return err({ status: 403, code: 'FORBIDDEN', message: 'Du kannst nur eigene Posts löschen.' });

            await this.db.transaction(async (tx) => {
                await tx.delete(crewNowPost).where(eq(crewNowPost.id, postId));
            });
            if (post.discussionId) {
                await this.discussions.deleteDiscussion(post.discussionId);
            }
            await Promise.all([post.backImageFileId, post.frontImageFileId].map((fileId) => this.files.deleteFile(fileId)));
            await this.activityFeed.invalidateFeed();
            return ok(null);
        } catch (error) {
            console.error('CrewNow delete failed', error);
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Post konnte nicht gelöscht werden.' });
        }
    }

    async discardPendingUpload(authorUserId: string, fileId: string): Promise<Result<null, CrewNowError>> {
        if (!validId(fileId)) return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Bild-ID.' });
        try {
            const [referenced] = await this.db.select({ id: crewNowPost.id })
                .from(crewNowPost)
                .where(or(eq(crewNowPost.backImageFileId, fileId), eq(crewNowPost.frontImageFileId, fileId)))
                .limit(1);
            if (referenced) return err({ status: 409, code: 'CONFLICT', message: 'Das Bild gehört bereits zu einem CrewNow.' });
            const deleted = await this.files.discardPendingUpload(fileId, authorUserId);
            return deleted.ok ? ok(null) : err(deleted.error);
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Das nicht verwendete Bild konnte nicht entfernt werden.' });
        }
    }

    async getPost(viewerUserId: string, postId: string): Promise<Result<CrewNowPostSummary, NotFoundError | InternalError>> {
        try {
            const [post] = await this.db.select().from(crewNowPost).where(eq(crewNowPost.id, postId)).limit(1);
            if (!post) return err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
            const summary = await this.resolvePost(post, viewerUserId);
            return summary ? ok(summary) : err({ status: 404, code: 'NOT_FOUND', message: 'Post nicht gefunden.' });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Post konnte nicht geladen werden.' });
        }
    }

    async getTimeline(
        viewerUserId: string,
        options: { limit?: number; before?: CrewNowCursor } = {},
    ): Promise<Result<CrewNowTimeline, BadRequestError | InternalError>> {
        if ((options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1))
            || (options.before !== undefined && (!Number.isFinite(options.before.createdAt.getTime()) || !validId(options.before.id)))) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültige Timeline-Seite.' });
        }
        const limit = Math.min(options.limit ?? 20, 100);
        try {
            const condition = options.before
                ? or(
                    lt(crewNowPost.createdAt, options.before.createdAt),
                    and(eq(crewNowPost.createdAt, options.before.createdAt), lt(crewNowPost.id, options.before.id)),
                )
                : undefined;
            const rows = await this.db.select().from(crewNowPost)
                .where(condition)
                .orderBy(desc(crewNowPost.createdAt), desc(crewNowPost.id))
                .limit(limit + 1);
            const hasMore = rows.length > limit;
            const pageRows = rows.slice(0, limit);
            const discussionIds = pageRows.flatMap((post) => post.discussionId ? [post.discussionId] : []);
            const commentCounts = await this.discussions.getMessageCounts(discussionIds);
            const items = (await Promise.all(pageRows.map((post) => this.resolvePost(
                post,
                viewerUserId,
                post.discussionId ? commentCounts[post.discussionId] ?? 0 : 0,
            )))).filter((post): post is CrewNowPostSummary => post !== null);
            const last = pageRows[pageRows.length - 1];
            return ok({
                items,
                nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
            });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Timeline konnte nicht geladen werden.' });
        }
    }

    async getPostForActivity(viewerUserId: string, postId: string): Promise<Result<CrewNowPostSummary, NotFoundError | InternalError>> {
        return this.getPost(viewerUserId, postId);
    }

    async getActivityTaggedUsers(_viewerUserId: string, ids: string[]): Promise<CrewNowUserSummary[]> {
        if (ids.length === 0) return [];
        const rows = await this.db.select({ id: user.id, name: user.name, image: user.image })
            .from(user).where(inArray(user.id, [...new Set(ids)])).orderBy(user.name);
        const byId = new Map(rows.map((person) => [person.id, person]));
        return ids.flatMap((id) => {
            const person = byId.get(id);
            return person ? [person] : [];
        });
    }

    async getTagIdsForPost(postId: string): Promise<string[]> {
        const rows = await this.db.select({ id: crewNowPostTag.taggedUserId })
            .from(crewNowPostTag).where(eq(crewNowPostTag.postId, postId)).orderBy(crewNowPostTag.position);
        return rows.map((row) => row.id);
    }

    createId(): string {
        return randomUUID();
    }
}