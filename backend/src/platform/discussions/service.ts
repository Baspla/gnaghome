import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type ForbiddenError, type InternalError, type NotFoundError, type Result } from '../../lib/result';
import { RealtimeChannels } from '$shared/constants';
import type { DiscussionChangedEvent, ActivityFeedChangedEvent } from '$shared/dto/platform-event';
import type { BroadcastPublisher } from '../realtime/service';
import { discussion, discussionMessage, type DiscussionMessage } from './schema';
import { user } from '../users/schema';
import type { NotificationsService } from '../notifications/service';

const MAX_MESSAGE_LENGTH = 5000;

export type DiscussionMessageSummary = {
    id: string;
    discussionId: string;
    body: string;
    author: { id: string; name: string; image: string | null };
    canEdit: boolean;
    createdAt: Date;
    editedAt: Date | null;
};

type DiscussionError = BadRequestError | ForbiddenError | InternalError | NotFoundError;

export class DiscussionsService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher,
        private readonly notifications: Pick<NotificationsService, 'notifyUsers'> = { notifyUsers: async () => {} },
        private getTargetOwner: (targetType: string, targetId: string) => Promise<string | null> = async () => null,
    ) {}

    setTargetOwnerResolver(resolver: (targetType: string, targetId: string) => Promise<string | null>): void {
        this.getTargetOwner = resolver;
    }

    async getOrCreateDiscussion(targetType: string, targetId: string): Promise<Result<typeof discussion.$inferSelect, BadRequestError | InternalError>> {
        if (!validReference(targetType) || !validReference(targetId)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültiges Diskussionsziel.' });
        }
        try {
            const id = randomUUID();
            await this.db.insert(discussion).values({ id, targetType, targetId }).onConflictDoNothing();
            const [row] = await this.db.select().from(discussion).where(and(
                eq(discussion.targetType, targetType),
                eq(discussion.targetId, targetId),
            )).limit(1);
            return row ? ok(row) : err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Diskussion konnte nicht angelegt werden.' });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Diskussion konnte nicht angelegt werden.' });
        }
    }

    async getDiscussion(discussionId: string): Promise<Result<typeof discussion.$inferSelect, NotFoundError | InternalError>> {
        try {
            const [row] = await this.db.select().from(discussion).where(eq(discussion.id, discussionId)).limit(1);
            return row
                ? ok(row)
                : err({ status: 404, code: 'NOT_FOUND', message: 'Diskussion nicht gefunden.' });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Diskussion konnte nicht geladen werden.' });
        }
    }

    async getDiscussionForTarget(targetType: string, targetId: string): Promise<Result<typeof discussion.$inferSelect, NotFoundError | InternalError>> {
        try {
            const [row] = await this.db.select().from(discussion).where(and(
                eq(discussion.targetType, targetType),
                eq(discussion.targetId, targetId),
            )).limit(1);
            return row
                ? ok(row)
                : err({ status: 404, code: 'NOT_FOUND', message: 'Diskussion nicht gefunden.' });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Diskussion konnte nicht geladen werden.' });
        }
    }

    async deleteDiscussion(discussionId: string): Promise<Result<null, NotFoundError | InternalError>> {
        try {
            const deleted = await this.db.delete(discussion).where(eq(discussion.id, discussionId)).returning({ id: discussion.id });
            return deleted.length > 0
                ? ok(null)
                : err({ status: 404, code: 'NOT_FOUND', message: 'Diskussion nicht gefunden.' });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Diskussion konnte nicht gelöscht werden.' });
        }
    }

    async getMessage(messageId: string): Promise<Result<DiscussionMessage, NotFoundError | InternalError>> {
        try {
            const [row] = await this.db.select().from(discussionMessage).where(eq(discussionMessage.id, messageId)).limit(1);
            return row
                ? ok(row)
                : err({ status: 404, code: 'NOT_FOUND', message: 'Kommentar nicht gefunden.' });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Kommentar konnte nicht geladen werden.' });
        }
    }

    async getMessages(discussionId: string, viewerUserId: string): Promise<Result<DiscussionMessageSummary[], NotFoundError | InternalError>> {
        try {
            const existing = await this.getDiscussion(discussionId);
            if (!existing.ok) return err(existing.error);
            const rows = await this.db.select({
                id: discussionMessage.id,
                discussionId: discussionMessage.discussionId,
                body: discussionMessage.body,
                createdAt: discussionMessage.createdAt,
                editedAt: discussionMessage.editedAt,
                authorUserId: discussionMessage.authorUserId,
                authorId: user.id,
                authorName: user.name,
                authorImage: user.image,
            }).from(discussionMessage)
                .innerJoin(user, eq(user.id, discussionMessage.authorUserId))
                .where(eq(discussionMessage.discussionId, discussionId))
                .orderBy(asc(discussionMessage.createdAt), asc(discussionMessage.id));
            return ok(rows.map((row) => ({
                id: row.id,
                discussionId: row.discussionId,
                canEdit: row.authorUserId === viewerUserId,
                body: row.body,
                author: { id: row.authorId, name: row.authorName, image: row.authorImage },
                createdAt: row.createdAt,
                editedAt: row.editedAt,
            })));
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Kommentare konnten nicht geladen werden.' });
        }
    }

    async getMessageCounts(discussionIds: string[]): Promise<Record<string, number>> {
        if (discussionIds.length === 0) return {};
        const rows = await this.db.select({
            discussionId: discussionMessage.discussionId,
            count: sql<number>`count(*)`,
        }).from(discussionMessage)
            .where(inArray(discussionMessage.discussionId, discussionIds))
            .groupBy(discussionMessage.discussionId);
        return Object.fromEntries(rows.map((row) => [row.discussionId, row.count]));
    }

    async createMessage(discussionId: string, authorUserId: string, body: string): Promise<Result<DiscussionMessageSummary, DiscussionError>> {
        const normalizedBody = typeof body === 'string' ? body.trim() : '';
        if (!validReference(discussionId) || !normalizedBody || normalizedBody.length > MAX_MESSAGE_LENGTH) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Kommentar muss zwischen 1 und 5.000 Zeichen enthalten.' });
        }
        const discussionResult = await this.getDiscussion(discussionId);
        if (!discussionResult.ok) return err(discussionResult.error);
        try {
            const [author] = await this.db.select({ id: user.id, name: user.name, image: user.image })
                .from(user).where(eq(user.id, authorUserId)).limit(1);
            if (!author) return err({ status: 404, code: 'NOT_FOUND', message: 'Benutzer nicht gefunden.' });
            const [row] = await this.db.insert(discussionMessage).values({
                id: randomUUID(), discussionId, authorUserId, body: normalizedBody,
            }).returning();
            if (!row) return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Kommentar konnte nicht gespeichert werden.' });
            await this.notifyNewMessage(discussionResult.value, authorUserId);
            await this.publishChanged(discussionId);
            return ok({ ...row, author, canEdit: true });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Kommentar konnte nicht gespeichert werden.' });
        }
    }

    private async notifyNewMessage(target: typeof discussion.$inferSelect, authorUserId: string): Promise<void> {
        try {
            const postAuthorId = target.targetType === 'crewnow.post'
                ? await this.getTargetOwner(target.targetType, target.targetId)
                : null;

            const previousAuthors = await this.db.select({ userId: discussionMessage.authorUserId })
                .from(discussionMessage).where(and(
                    eq(discussionMessage.discussionId, target.id),
                    ne(discussionMessage.authorUserId, authorUserId),
                ));
            const recipients = new Set(previousAuthors.map((row) => row.userId));

            if (target.targetType === 'crewnow.post') {
                if (postAuthorId && postAuthorId !== authorUserId) {
                    await this.notifications.notifyUsers('discussions.post-comment', [postAuthorId], {
                        title: 'Neuer Kommentar zu deinem CrewNow',
                        body: 'Jemand hat deinen CrewNow kommentiert.',
                        url: `/crewnow/posts/${encodeURIComponent(target.targetId)}`,
                    });
                }
            }

            if (postAuthorId) recipients.delete(postAuthorId);
            if (recipients.size > 0) {
                await this.notifications.notifyUsers('discussions.new-message', [...recipients], {
                    title: 'Neue Nachricht in einer Diskussion',
                    body: 'In einer Diskussion, an der du teilnimmst, gibt es eine neue Nachricht.',
                    url: target.targetType === 'crewnow.post' ? `/crewnow/posts/${encodeURIComponent(target.targetId)}` : '/',
                });
            }
        } catch {
            // Notification delivery is best-effort and cannot fail a persisted discussion message.
        }
    }

    async editMessage(messageId: string, authorUserId: string, body: string): Promise<Result<DiscussionMessageSummary, DiscussionError>> {
        const normalizedBody = typeof body === 'string' ? body.trim() : '';
        if (!normalizedBody || normalizedBody.length > MAX_MESSAGE_LENGTH) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Kommentar muss zwischen 1 und 5.000 Zeichen enthalten.' });
        }
        try {
            const current = await this.getMessage(messageId);
            if (!current.ok) return err(current.error);
            if (current.value.authorUserId !== authorUserId) {
                return err({ status: 403, code: 'FORBIDDEN', message: 'Du kannst nur eigene Kommentare bearbeiten.' });
            }
            const [row] = await this.db.update(discussionMessage)
                .set({ body: normalizedBody, editedAt: new Date() })
                .where(and(eq(discussionMessage.id, messageId), eq(discussionMessage.authorUserId, authorUserId)))
                .returning();
            if (!row) return err({ status: 404, code: 'NOT_FOUND', message: 'Kommentar nicht gefunden.' });
            const [author] = await this.db.select({ id: user.id, name: user.name, image: user.image })
                .from(user).where(eq(user.id, authorUserId)).limit(1);
            if (!author) return err({ status: 404, code: 'NOT_FOUND', message: 'Benutzer nicht gefunden.' });
            await this.publishChanged(row.discussionId);
            return ok({ ...row, author, canEdit: true });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Kommentar konnte nicht gespeichert werden.' });
        }
    }

    async deleteMessage(messageId: string, authorUserId: string): Promise<Result<null, DiscussionError>> {
        try {
            const current = await this.getMessage(messageId);
            if (!current.ok) return err(current.error);
            if (current.value.authorUserId !== authorUserId) {
                return err({ status: 403, code: 'FORBIDDEN', message: 'Du kannst nur eigene Kommentare löschen.' });
            }
            const deleted = await this.db.delete(discussionMessage).where(and(
                eq(discussionMessage.id, messageId),
                eq(discussionMessage.authorUserId, authorUserId),
            )).returning({ id: discussionMessage.id, discussionId: discussionMessage.discussionId });
            const row = deleted[0];
            if (!row) return err({ status: 404, code: 'NOT_FOUND', message: 'Kommentar nicht gefunden.' });
            await this.publishChanged(row.discussionId);
            return ok(null);
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Kommentar konnte nicht gelöscht werden.' });
        }
    }

    private async publishChanged(discussionId: string): Promise<void> {
        const event: DiscussionChangedEvent = {
            id: randomUUID(),
            occurredAt: new Date().toISOString(),
            type: 'discussion.changed',
            data: {},
        };
        const feedEvent: ActivityFeedChangedEvent = {
            id: randomUUID(),
            occurredAt: event.occurredAt,
            type: 'activity-feed.changed',
            data: {},
        };
        for (const [channel, payload] of [
            [RealtimeChannels.DISCUSSIONS, event],
            [RealtimeChannels.ACTIVITY_FEED, feedEvent],
        ] as const) {
            try {
                const result = await this.broadcast([channel], payload);
                if (!result.ok) console.warn('Discussion update broadcast failed', result.error.message);
            } catch {
                // Realtime is an invalidation only; the persisted message remains authoritative.
            }
        }
    }
}

function validReference(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}