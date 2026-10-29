import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { UserService } from '../users/service';
import type { createAuthMiddleware } from '../auth';
import type { ActivityFeedService, ActivityFeedRecord } from './service';

type ActivityFeedUserService = Pick<UserService, 'getUserAsUser'>;
type ActivityFeedServiceDependency = Pick<ActivityFeedService, 'getFeed'>;

function toPublicUser(user: { id: string; name: string; image: string | null } | null) {
    return user ? { id: user.id, name: user.name, image: user.image } : null;
}

function toActivitySummary(activity: ActivityFeedRecord, actor: ReturnType<typeof toPublicUser>, subject: ReturnType<typeof toPublicUser>) {
    return {
        id: activity.id,
        type: activity.type,
        actor,
        subject,
        target: activity.targetType && activity.targetId
            ? { type: activity.targetType, id: activity.targetId }
            : null,
        data: activity.data,
        occurredAt: activity.occurredAt.toISOString(),
    };
}

export function createActivityFeedModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    activityFeedService: ActivityFeedServiceDependency,
    userService: ActivityFeedUserService,
) {
    return new Elysia({ prefix: '/activity-feed', name: Modules.ACTIVITY_FEED })
        .use(authMiddleware)
        .get('/', async ({ user, query, status }) => {
            if (Boolean(query.beforeOccurredAt) !== Boolean(query.beforeId)) {
                return status(400, {
                    error: { status: 400, code: 'BAD_REQUEST', message: 'Both cursor fields are required' },
                });
            }
            const occurredAt = query.beforeOccurredAt ? new Date(query.beforeOccurredAt) : undefined;
            if (occurredAt && !Number.isFinite(occurredAt.getTime())) {
                return status(400, {
                    error: { status: 400, code: 'BAD_REQUEST', message: 'Invalid activity feed cursor' },
                });
            }
            const before = occurredAt && query.beforeId
                ? { occurredAt, id: query.beforeId }
                : undefined;
            const result = await activityFeedService.getFeed(
                user.id,
                { limit: query.limit, before },
                async (viewerId, activity) => {
                    const profileId = activity.targetType === 'platform.profile'
                        ? activity.targetId
                        : activity.type === 'profile.birthday'
                            ? activity.subjectUserId
                            : null;
                    if (!profileId) return false;

                    const profile = await userService.getUserAsUser(viewerId, profileId);
                    return profile.ok;
                },
            );
            if (!result.ok) return status(result.error.status, { error: result.error });

            const items: ReturnType<typeof toActivitySummary>[] = [];
            for (const activity of result.value.items) {
                const profileId = activity.targetType === 'platform.profile'
                    ? activity.targetId
                    : activity.type === 'profile.birthday'
                        ? activity.subjectUserId
                        : null;
                if (!profileId) continue;

                const targetResult = await userService.getUserAsUser(user.id, profileId);
                if (!targetResult.ok) continue;

                const actorResult = activity.actorUserId
                    ? await userService.getUserAsUser(user.id, activity.actorUserId)
                    : null;
                const subjectResult = activity.subjectUserId
                    ? await userService.getUserAsUser(user.id, activity.subjectUserId)
                    : null;

                items.push(toActivitySummary(
                    activity,
                    actorResult?.ok ? toPublicUser(actorResult.value) : null,
                    subjectResult?.ok ? toPublicUser(subjectResult.value) : null,
                ));
            }

            return {
                items,
                nextCursor: result.value.nextCursor
                    ? {
                        occurredAt: result.value.nextCursor.occurredAt.toISOString(),
                        id: result.value.nextCursor.id,
                    }
                    : null,
            };
        }, {
            query: t.Object({
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
                beforeOccurredAt: t.Optional(t.String()),
                beforeId: t.Optional(t.String()),
            }),
            auth: true,
        });
}