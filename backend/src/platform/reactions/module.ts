import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { createAuthMiddleware } from '../auth';
import type { ReactionsService } from './service';

type Service = Pick<ReactionsService, 'getReactions' | 'toggleReaction'>;
export type ReactionTargetAuthorizer = (userId: string, targetType: string, targetId: string) => Promise<boolean>;

export function createReactionsModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    service: Service,
    canViewTarget: ReactionTargetAuthorizer,
) {
    const app = new Elysia({ prefix: '/reactions', name: Modules.REACTIONS }).use(authMiddleware);
    const authorizedTarget = async (userId: string, targetType: string, targetId: string) => {
        if (!await canViewTarget(userId, targetType, targetId)) {
            return { ok: false as const, error: { status: 404 as const, code: 'NOT_FOUND' as const, message: 'Ziel nicht gefunden.' } };
        }
        return { ok: true as const };
    };

    return app
        .get('/targets/:targetType/:targetId', async ({ user, params, status }) => {
            const access = await authorizedTarget(user.id, params.targetType, params.targetId);
            if (!access.ok) return status(access.error.status, { error: access.error });
            const result = await service.getReactions(params.targetType, params.targetId, user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return {
                ...result.value,
                items: result.value.items.map((item) => ({
                    ...item,
                    createdAt: item.createdAt.toISOString(),
                    updatedAt: item.updatedAt.toISOString(),
                })),
            };
        }, {
            params: t.Object({ targetType: t.String({ minLength: 1, maxLength: 128 }), targetId: t.String({ minLength: 1, maxLength: 128 }) }),
            auth: true,
        })
        .put('/targets/:targetType/:targetId', async ({ user, params, body, status }) => {
            const access = await authorizedTarget(user.id, params.targetType, params.targetId);
            if (!access.ok) return status(access.error.status, { error: access.error });
            const result = await service.toggleReaction(params.targetType, params.targetId, user.id, body.emoji);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return result.value;
        }, {
            params: t.Object({ targetType: t.String({ minLength: 1, maxLength: 128 }), targetId: t.String({ minLength: 1, maxLength: 128 }) }),
            body: t.Object({ emoji: t.String({ minLength: 1, maxLength: 64 }) }),
            auth: true,
        });
}