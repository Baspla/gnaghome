import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type InternalError, type Result } from '../../lib/result';
import { createLogger } from '../../lib/logger';
import { activityFeedItem } from './schema';
import type { BroadcastPublisher } from '../realtime/service';
import { RealtimeChannels } from '$shared/constants';
import type { ActivityFeedChangedEvent } from '$shared/dto/platform-event';

const logger = createLogger('activity-feed');

export const ACTIVITY_TYPES = [
    'crewnow.image_posted',
    'profile.updated',
    'profile.birthday',
    'games.game_added',
    'calendar.event_started',
] as const;

export type ActivityType = typeof ACTIVITY_TYPES[number];

export type ActivityDataByType = {
    'crewnow.image_posted': { imageFileId: string };
    'profile.updated': { changedFields: Array<'name' | 'image'> };
    'profile.birthday': Record<string, never>;
    'games.game_added': { gameId: string };
    'calendar.event_started': { title: string };
};

export type ActivityTarget = {
    type: string;
    id: string;
};

type ActivityInputBase<TType extends ActivityType> = {
    type: TType;
    occurredAt?: Date;
};

export type RecordActivityInput =
    | (ActivityInputBase<'crewnow.image_posted'> & {
        actorUserId: string;
        subjectUserId?: string | null;
        target: ActivityTarget & { type: 'crewnow.post' };
        data: ActivityDataByType['crewnow.image_posted'];
    })
    | (ActivityInputBase<'profile.updated'> & {
        actorUserId: string;
        subjectUserId: string;
        target: ActivityTarget & { type: 'platform.profile' };
        data: ActivityDataByType['profile.updated'];
    })
    | (ActivityInputBase<'profile.birthday'> & {
        actorUserId?: null;
        subjectUserId: string;
        target?: (ActivityTarget & { type: 'platform.profile' }) | null;
        data: ActivityDataByType['profile.birthday'];
    })
    | (ActivityInputBase<'games.game_added'> & {
        actorUserId: string;
        subjectUserId?: string | null;
        target: ActivityTarget & { type: 'games.library_entry' };
        data: ActivityDataByType['games.game_added'];
    })
    | (ActivityInputBase<'calendar.event_started'> & {
        actorUserId?: string | null;
        subjectUserId?: string | null;
        target: ActivityTarget & { type: 'calendar.event' };
        data: ActivityDataByType['calendar.event_started'];
    });

export type ActivityFeedRecord = {
    id: string;
    type: ActivityType;
    actorUserId: string | null;
    subjectUserId: string | null;
    targetType: string | null;
    targetId: string | null;
    data: ActivityDataByType[ActivityType];
    occurredAt: Date;
    createdAt: Date;
};

export type ActivityFeedCursor = {
    occurredAt: Date;
    id: string;
};

export type ActivityFeedPage = {
    items: ActivityFeedRecord[];
    nextCursor: ActivityFeedCursor | null;
};

export type ActivityVisibilityResolver = (
    viewerUserId: string,
    activity: ActivityFeedRecord,
) => boolean | Promise<boolean>;

const EMPTY_DATA_TYPES = new Set<ActivityType>([
    'profile.birthday',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidActivityData(type: ActivityType, data: unknown): data is ActivityDataByType[ActivityType] {
    if (!isPlainObject(data)) return false;

    if (EMPTY_DATA_TYPES.has(type)) return Object.keys(data).length === 0;
    if (type === 'crewnow.image_posted') {
        return Object.keys(data).length === 1
            && typeof data.imageFileId === 'string'
            && data.imageFileId.trim().length > 0;
    }
    if (type === 'games.game_added') {
        return Object.keys(data).length === 1
            && typeof data.gameId === 'string'
            && data.gameId.trim().length > 0;
    }
    if (type === 'calendar.event_started') {
        return Object.keys(data).length === 1
            && typeof data.title === 'string'
            && data.title.trim().length > 0;
    }
    if (type !== 'profile.updated') return false;

    const keys = Object.keys(data);
    return keys.length === 1
        && keys[0] === 'changedFields'
        && Array.isArray(data.changedFields)
        && data.changedFields.length > 0
        && data.changedFields.every((field) => field === 'name' || field === 'image');
}

function isActivityType(value: unknown): value is ActivityType {
    return typeof value === 'string' && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

function isNamespacedTargetType(type: ActivityType, value: unknown): value is string {
    const targetTypes: Partial<Record<ActivityType, string>> = {
        'crewnow.image_posted': 'crewnow.post',
        'profile.updated': 'platform.profile',
        'profile.birthday': 'platform.profile',
        'games.game_added': 'games.library_entry',
        'calendar.event_started': 'calendar.event',
    };
    const expectedTargetType = targetTypes[type];
    return expectedTargetType !== undefined && value === expectedTargetType;
}

function isOptionalUserId(value: unknown): value is string | null | undefined {
    return value === undefined
        || value === null
        || (typeof value === 'string' && value.trim().length > 0);
}

function toRecord(row: typeof activityFeedItem.$inferSelect): ActivityFeedRecord {
    const data: unknown = JSON.parse(row.data);
    if (!isActivityType(row.type) || !isValidActivityData(row.type, data)) {
        throw new Error('Stored activity has an invalid type or payload');
    }
    if ((row.targetType === null) !== (row.targetId === null)) {
        throw new Error('Stored activity has an incomplete target reference');
    }

    return {
        id: row.id,
        type: row.type,
        actorUserId: row.actorUserId,
        subjectUserId: row.subjectUserId,
        targetType: row.targetType,
        targetId: row.targetId,
        data,
        occurredAt: row.occurredAt,
        createdAt: row.createdAt,
    };
}

function isValidDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
}

function hasValidActivityReferences(input: {
    type: ActivityType;
    actorUserId?: string | null;
    subjectUserId?: string | null;
    target?: ActivityTarget | null;
}): boolean {
    if (input.type === 'profile.birthday') {
        return typeof input.subjectUserId === 'string'
            && (input.actorUserId === undefined || input.actorUserId === null)
            && (input.target === undefined || input.target === null || (
                input.target.type === 'platform.profile'
                && input.target.id === input.subjectUserId
            ));
    }

    if (input.type === 'calendar.event_started') {
        return input.target?.type === 'calendar.event';
    }
    if (input.type === 'crewnow.image_posted') return input.actorUserId != null && input.target?.type === 'crewnow.post';
    if (input.type === 'games.game_added') return input.actorUserId != null && input.target?.type === 'games.library_entry';
    if (input.type === 'profile.updated') {
        return input.actorUserId != null
            && input.subjectUserId != null
            && input.target?.type === 'platform.profile'
            && input.target.id === input.subjectUserId;
    }

    return false;
}

export class ActivityFeedService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher,
    ) {}

    async recordActivity(input: RecordActivityInput): Promise<Result<ActivityFeedRecord, BadRequestError | InternalError>> {
        if (!isPlainObject(input)
            || !isActivityType(input.type)
            || !isValidActivityData(input.type, input.data)
            || !hasValidActivityReferences(input)
            || !isOptionalUserId(input.actorUserId)
            || !isOptionalUserId(input.subjectUserId)
            || (input.target !== undefined && input.target !== null && (
                !isPlainObject(input.target)
                || !isNamespacedTargetType(input.type, input.target.type)
                || typeof input.target.id !== 'string'
                || input.target.id.trim().length === 0
            ))
            || (input.occurredAt !== undefined && !isValidDate(input.occurredAt))) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Invalid activity type or payload' });
        }

        const occurredAt = input.occurredAt ?? new Date();
        try {
            const row = this.db.insert(activityFeedItem).values({
                id: crypto.randomUUID(),
                type: input.type,
                actorUserId: input.actorUserId ?? null,
                subjectUserId: input.subjectUserId ?? null,
                targetType: input.target?.type ?? null,
                targetId: input.target?.id ?? null,
                data: JSON.stringify(input.data),
                occurredAt,
            }).returning().get();

            if (!row) {
                return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to record activity' });
            }
            const activity = toRecord(row);
            const event: ActivityFeedChangedEvent = {
                id: crypto.randomUUID(),
                occurredAt: new Date().toISOString(),
                type: 'activity-feed.changed',
                data: {},
            };
            try {
                const broadcastResult = await this.broadcast([RealtimeChannels.ACTIVITY_FEED], event);
                if (!broadcastResult.ok) {
                    logger.warn('activity recorded but feed invalidation failed', {
                        type: activity.type,
                        message: broadcastResult.error.message,
                    });
                }
            } catch (error) {
                logger.warn('activity recorded but feed invalidation failed', {
                    type: activity.type,
                    error: String(error),
                });
            }
            return ok(activity);
        } catch (error) {
            logger.error('failed to record activity', { type: input.type, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to record activity' });
        }
    }

    async getFeed(
        viewerUserId: string,
        options: { limit?: number; before?: ActivityFeedCursor } = {},
        canView: ActivityVisibilityResolver,
    ): Promise<Result<ActivityFeedPage, BadRequestError | InternalError>> {
        if ((options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1))
            || (options.before !== undefined && (
                !isValidDate(options.before.occurredAt)
                || typeof options.before.id !== 'string'
                || options.before.id.trim().length === 0
            ))) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Invalid activity feed pagination options' });
        }
        const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? 20), 100));
        const batchSize = 50;
        const visible: ActivityFeedRecord[] = [];
        let scanCursor = options.before;

        try {
            while (visible.length <= limit) {
                const conditions = scanCursor
                    ? or(
                        lt(activityFeedItem.occurredAt, scanCursor.occurredAt),
                        and(
                            eq(activityFeedItem.occurredAt, scanCursor.occurredAt),
                            lt(activityFeedItem.id, scanCursor.id),
                        ),
                    )
                    : undefined;
                const rows = await this.db.select()
                    .from(activityFeedItem)
                    .where(conditions)
                    .orderBy(desc(activityFeedItem.occurredAt), desc(activityFeedItem.id))
                    .limit(batchSize);

                if (rows.length === 0) break;

                for (const row of rows) {
                    const activity = toRecord(row);
                    scanCursor = { occurredAt: activity.occurredAt, id: activity.id };
                    if (await canView(viewerUserId, activity)) visible.push(activity);
                    if (visible.length > limit) break;
                }

                if (visible.length > limit || rows.length < batchSize) break;
            }

            const hasNextPage = visible.length > limit;
            const items = visible.slice(0, limit);
            const lastItem = items[items.length - 1];
            return ok({
                items,
                nextCursor: hasNextPage && lastItem
                    ? { occurredAt: lastItem.occurredAt, id: lastItem.id }
                    : null,
            });
        } catch (error) {
            logger.error('failed to read activity feed', { viewerUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to read activity feed' });
        }
    }
}