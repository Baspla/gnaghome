import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { createAuthMiddleware } from '../auth';
import type { DiscussionsService } from './service';

type DiscussionService = Pick<DiscussionsService, 'getDiscussion' | 'getMessage' | 'getMessages' | 'createMessage' | 'editMessage' | 'deleteMessage'>;
export type DiscussionTargetAuthorizer = (
    userId: string,
    targetType: string,
    targetId: string,
) => Promise<boolean>;

export function createDiscussionsModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    service: DiscussionService,
    canViewTarget: DiscussionTargetAuthorizer,
) {
    const app = new Elysia({ prefix: '/discussions', name: Modules.DISCUSSIONS }).use(authMiddleware);
    const authorizedDiscussion = async (userId: string, discussionId: string) => {
        const found = await service.getDiscussion(discussionId);
        if (!found.ok) return { ok: false as const, error: found.error };
        if (!await canViewTarget(userId, found.value.targetType, found.value.targetId)) {
            return { ok: false as const, error: { status: 404 as const, code: 'NOT_FOUND' as const, message: 'Diskussion nicht gefunden.' } };
        }
        return { ok: true as const, value: found.value };
    };

    return app
        .get('/:discussionId/messages', async ({ user, params, status }) => {
            const access = await authorizedDiscussion(user.id, params.discussionId);
            if (!access.ok) return status(access.error.status, { error: access.error });
            const result = await service.getMessages(params.discussionId, user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { items: result.value.map((message) => ({
                ...message,
                createdAt: message.createdAt.toISOString(),
                editedAt: message.editedAt?.toISOString() ?? null,
            })) };
        }, { params: t.Object({ discussionId: t.String({ minLength: 1, maxLength: 128 }) }), auth: true })
        .post('/:discussionId/messages', async ({ user, params, body, status }) => {
            const access = await authorizedDiscussion(user.id, params.discussionId);
            if (!access.ok) return status(access.error.status, { error: access.error });
            const result = await service.createMessage(params.discussionId, user.id, body.body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            const message = result.value;
            return status(201, {
                ...message,
                createdAt: message.createdAt.toISOString(),
                editedAt: message.editedAt?.toISOString() ?? null,
            });
        }, {
            params: t.Object({ discussionId: t.String({ minLength: 1, maxLength: 128 }) }),
            body: t.Object({ body: t.String({ minLength: 1, maxLength: 5000 }) }),
            auth: true,
        })
        .patch('/messages/:messageId', async ({ user, params, body, status }) => {
            const message = await service.getMessage(params.messageId);
            if (!message.ok) return status(message.error.status, { error: message.error });
            const access = await authorizedDiscussion(user.id, message.value.discussionId);
            if (!access.ok) return status(access.error.status, { error: access.error });
            const result = await service.editMessage(params.messageId, user.id, body.body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { ...result.value, createdAt: result.value.createdAt.toISOString(), editedAt: result.value.editedAt?.toISOString() ?? null };
        }, {
            params: t.Object({ messageId: t.String({ minLength: 1, maxLength: 128 }) }),
            body: t.Object({ body: t.String({ minLength: 1, maxLength: 5000 }) }),
            auth: true,
        })
        .delete('/messages/:messageId', async ({ user, params, status }) => {
            const message = await service.getMessage(params.messageId);
            if (!message.ok) return status(message.error.status, { error: message.error });
            const access = await authorizedDiscussion(user.id, message.value.discussionId);
            if (!access.ok) return status(access.error.status, { error: access.error });
            const result = await service.deleteMessage(params.messageId, user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, { params: t.Object({ messageId: t.String({ minLength: 1, maxLength: 128 }) }), auth: true });
}