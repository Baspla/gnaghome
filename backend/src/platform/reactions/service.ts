import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type InternalError, type Result } from '../../lib/result';
import { user } from '../users/schema';
import type { BroadcastPublisher } from '../realtime/service';
import { RealtimeChannels } from '$shared/constants';
import type { ReactionChangedEvent } from '$shared/dto/platform-event';
import { reaction } from './schema';

const TARGET_TYPE_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const CUSTOM_EMOJI_PATTERN = /^:([a-z0-9][a-z0-9_-]{0,31}):$/;
const SegmenterConstructor = (Intl as unknown as {
    Segmenter: new (locale: string, options: { granularity: 'grapheme' }) => { segment: (input: string) => Iterable<unknown> };
}).Segmenter;
const graphemeSegmenter = new SegmenterConstructor('en', { granularity: 'grapheme' });

export type ReactionUser = { id: string; name: string; image: string | null };
export type ReactionSummary = {
    id: string;
    emoji: string;
    createdAt: Date;
    updatedAt: Date;
    user: ReactionUser;
};
export type ReactionCollection = {
    count: number;
    viewerReaction: string | null;
    items: ReactionSummary[];
};
export type ReactionChange = {
    changed: boolean;
    reaction: { emoji: string } | null;
};
export type ReactionTarget = { targetType: string; targetId: string };

type ReactionError = BadRequestError | InternalError;
type CustomEmojiLookup = (name: string) => Promise<boolean>;
type ReactionCreatedHandler = (target: ReactionTarget, actorUserId: string) => Promise<void>;

function validTarget(targetType: unknown, targetId: unknown): targetType is string {
    return typeof targetType === 'string' && TARGET_TYPE_PATTERN.test(targetType)
        && typeof targetId === 'string' && targetId.trim().length > 0 && targetId.length <= 128;
}

function validUnicodeEmoji(value: string): boolean {
    if (!value || value.length > 32 || value.includes(':') || /\s/u.test(value)) return false;
    try {
        const regionalIndicators = [...value].filter((character) => /\p{Regional_Indicator}/u.test(character)).length;
        const hasKeycap = value.includes('\u20E3');
        const validKeycap = /^(?:[#*0-9]\uFE0F?\u20E3)$/u.test(value);
        return [...graphemeSegmenter.segment(value)].length === 1
            && (/(\p{Extended_Pictographic}|\uFE0F)/u.test(value) || regionalIndicators === 2 || validKeycap)
            && (!regionalIndicators || regionalIndicators === 2)
            && (!hasKeycap || validKeycap)
            && /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D\u20E3\u{1F3FB}-\u{1F3FF}]+$/u.test(value);
    } catch {
        return false;
    }
}

export function isReactionEmoji(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    return validUnicodeEmoji(value) || CUSTOM_EMOJI_PATTERN.test(value);
}

export class ReactionsService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
        private readonly clock: () => Date = () => new Date(),
        private readonly customEmojiExists: CustomEmojiLookup = async () => false,
        private readonly onCreated: ReactionCreatedHandler = async () => {},
    ) {}

    async getReactions(targetType: string, targetId: string, viewerUserId: string): Promise<Result<ReactionCollection, ReactionError>> {
        if (!validTarget(targetType, targetId)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Ungültiges Reaktionsziel.' });
        }
        try {
            const rows = await this.db.select({
                id: reaction.id,
                emoji: reaction.emoji,
                createdAt: reaction.createdAt,
                updatedAt: reaction.updatedAt,
                userId: user.id,
                userName: user.name,
                userImage: user.image,
            }).from(reaction)
                .innerJoin(user, eq(user.id, reaction.userId))
                .where(and(eq(reaction.targetType, targetType), eq(reaction.targetId, targetId)))
                .orderBy(reaction.createdAt, reaction.id);
            const items = rows.map((row) => ({
                id: row.id,
                emoji: row.emoji,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                user: { id: row.userId, name: row.userName, image: row.userImage },
            }));
            return ok({
                count: items.length,
                viewerReaction: items.find((item) => item.user.id === viewerUserId)?.emoji ?? null,
                items,
            });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Reaktionen konnten nicht geladen werden.' });
        }
    }

    async getCounts(targetType: string, targetIds: readonly string[]): Promise<Record<string, number>> {
        if (!TARGET_TYPE_PATTERN.test(targetType) || targetIds.length === 0) return {};
        const uniqueIds = [...new Set(targetIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 128))];
        if (uniqueIds.length === 0) return {};
        const rows = await this.db.select({ targetId: reaction.targetId, count: sql<number>`count(*)` })
            .from(reaction)
            .where(and(eq(reaction.targetType, targetType), inArray(reaction.targetId, uniqueIds)))
            .groupBy(reaction.targetId);
        return Object.fromEntries(rows.map((row) => [row.targetId, row.count]));
    }

    async toggleReaction(
        targetType: string,
        targetId: string,
        actorUserId: string,
        emoji: string,
    ): Promise<Result<ReactionChange, ReactionError>> {
        if (!validTarget(targetType, targetId) || !isReactionEmoji(emoji)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Das Reaktionsziel oder Emoji ist ungültig.' });
        }
        const customMatch = CUSTOM_EMOJI_PATTERN.exec(emoji);
        if (customMatch && !await this.customEmojiExists(customMatch[1]!)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Dieses Custom Emoji ist nicht verfügbar.' });
        }

        let action: ReactionChangedEvent['action'] | null = null;
        let created = false;
        let change: ReactionChange;
        try {
            change = await this.db.transaction(async (tx) => {
                const [existing] = await tx.select().from(reaction).where(and(
                    eq(reaction.targetType, targetType),
                    eq(reaction.targetId, targetId),
                    eq(reaction.userId, actorUserId),
                )).limit(1);

                if (existing?.emoji === emoji) {
                    const [deleted] = await tx.delete(reaction).where(eq(reaction.id, existing.id)).returning({ id: reaction.id });
                    if (!deleted) return { changed: false, reaction: null };
                    action = 'DELETED';
                    return { changed: true, reaction: null };
                }

                const now = this.clock();
                if (existing) {
                    await tx.update(reaction).set({ emoji, updatedAt: now }).where(eq(reaction.id, existing.id));
                    action = 'UPDATED';
                } else {
                    const [inserted] = await tx.insert(reaction).values({
                        id: randomUUID(), targetType, targetId, userId: actorUserId, emoji, createdAt: now, updatedAt: now,
                    }).onConflictDoNothing().returning({ id: reaction.id });
                    if (inserted) {
                        action = 'CREATED';
                        created = true;
                        return { changed: true, reaction: { emoji } };
                    }
                    const [concurrent] = await tx.select().from(reaction).where(and(
                        eq(reaction.targetType, targetType),
                        eq(reaction.targetId, targetId),
                        eq(reaction.userId, actorUserId),
                    )).limit(1);
                    if (!concurrent) throw new Error('Reaction was not inserted and no existing reaction was found');
                    if (concurrent.emoji === emoji) return { changed: false, reaction: { emoji } };
                    await tx.update(reaction).set({ emoji, updatedAt: now }).where(eq(reaction.id, concurrent.id));
                    action = 'UPDATED';
                }
                return { changed: true, reaction: { emoji } };
            });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Die Reaktion konnte nicht gespeichert werden.' });
        }

        if (action) await this.publishChanged({ targetType, targetId }, action);
        if (created) {
            try {
                await this.onCreated({ targetType, targetId }, actorUserId);
            } catch {
                // Notification delivery must not undo a persisted reaction.
            }
        }
        return ok(change);
    }

    async deleteTargetReactions(targetType: string, targetId: string): Promise<number> {
        if (!validTarget(targetType, targetId)) return 0;
        const deleted = await this.db.delete(reaction).where(and(
            eq(reaction.targetType, targetType),
            eq(reaction.targetId, targetId),
        )).returning({ id: reaction.id });
        return deleted.length;
    }

    private async publishChanged(target: ReactionTarget, action: ReactionChangedEvent['action']): Promise<void> {
        const event: ReactionChangedEvent = {
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'reaction.changed',
            action,
            entityId: `${target.targetType}:${encodeURIComponent(target.targetId)}`,
        };
        try {
            const result = await this.broadcast([RealtimeChannels.PUBLIC], event);
            if (!result.ok) console.warn('Reaction update broadcast failed', result.error.message);
        } catch {
            // Persisted reactions are authoritative and clients refresh on reconnect.
        }
    }
}