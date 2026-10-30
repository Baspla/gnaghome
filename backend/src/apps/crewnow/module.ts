import { Elysia, t } from 'elysia';
import type { createAuthMiddleware } from '../../platform/auth';
import type { CrewNowService } from './service';

type Service = Pick<CrewNowService, 'createId' | 'createPost' | 'updatePost' | 'deletePost' | 'discardPendingUpload' | 'getPost' | 'getTimeline' | 'searchUsers'>;

function cursorDate(value?: string) {
    if (!value) return undefined;
    const createdAt = new Date(value);
    return Number.isFinite(createdAt.getTime()) ? createdAt : null;
}

export function createCrewNowModule(authMiddleware: ReturnType<typeof createAuthMiddleware>, service: Service) {
    return new Elysia({ prefix: '/crewnow', name: 'crewnow' })
        .use(authMiddleware)
        .get('/users', async ({ query, status, user }) => {
            const result = await service.searchUsers(query.q ?? '', query.limit ?? 20, user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { items: result.value.map((profile) => ({ ...profile, isSelf: profile.id === user.id })) };
        }, {
            query: t.Object({ q: t.Optional(t.String({ maxLength: 80 })), limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })) }),
            auth: true,
        })
        .get('/timeline', async ({ user, query, status }) => {
            if (Boolean(query.beforeCreatedAt) !== Boolean(query.beforeId)) {
                return status(400, { error: { status: 400, code: 'BAD_REQUEST', message: 'Beide Cursor-Felder sind erforderlich.' } });
            }
            const beforeCreatedAt = cursorDate(query.beforeCreatedAt);
            if (beforeCreatedAt === null) {
                return status(400, { error: { status: 400, code: 'BAD_REQUEST', message: 'Der Timeline-Cursor ist ungültig.' } });
            }
            const result = await service.getTimeline(user.id, {
                limit: query.limit,
                before: beforeCreatedAt && query.beforeId ? { createdAt: beforeCreatedAt, id: query.beforeId } : undefined,
            });
            if (!result.ok) return status(result.error.status, { error: result.error });
            return {
                items: result.value.items.map((post) => ({ ...post, createdAt: post.createdAt.toISOString(), updatedAt: post.updatedAt.toISOString() })),
                nextCursor: result.value.nextCursor
                    ? { createdAt: result.value.nextCursor.createdAt.toISOString(), id: result.value.nextCursor.id }
                    : null,
            };
        }, {
            query: t.Object({
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
                beforeCreatedAt: t.Optional(t.String()),
                beforeId: t.Optional(t.String()),
            }),
            auth: true,
        })
        .post('/posts', async ({ user, body, status }) => {
            const result = await service.createPost(user.id, { ...body, id: body.id ?? service.createId() });
            if (!result.ok) return status(result.error.status, { error: result.error });
            return status(result.value.created ? 201 : 200, {
                ...result.value,
                createdAt: result.value.createdAt.toISOString(),
                updatedAt: result.value.updatedAt.toISOString(),
            });
        }, {
            body: t.Object({
                id: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
                backImageFileId: t.String({ minLength: 1, maxLength: 128 }),
                frontImageFileId: t.String({ minLength: 1, maxLength: 128 }),
                caption: t.Union([t.String({ maxLength: 500 }), t.Null()]),
                taggedUserIds: t.Array(t.String({ minLength: 1, maxLength: 128 }), { maxItems: 50 }),
            }),
            auth: true,
        })
        .get('/posts/:id', async ({ user, params, status }) => {
            const result = await service.getPost(user.id, params.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { ...result.value, createdAt: result.value.createdAt.toISOString(), updatedAt: result.value.updatedAt.toISOString() };
        }, { params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }), auth: true })
        .patch('/posts/:id', async ({ user, params, body, status }) => {
            const result = await service.updatePost(user.id, params.id, body);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { ...result.value, createdAt: result.value.createdAt.toISOString(), updatedAt: result.value.updatedAt.toISOString() };
        }, {
            params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }),
            body: t.Object({
                caption: t.Union([t.String({ maxLength: 500 }), t.Null()]),
                taggedUserIds: t.Array(t.String({ minLength: 1, maxLength: 128 }), { maxItems: 50 }),
            }),
            auth: true,
        })
        .delete('/posts/:id', async ({ user, params, status }) => {
            const result = await service.deletePost(user.id, params.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, { params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }), auth: true })
        .delete('/uploads/:id', async ({ user, params, status }) => {
            const result = await service.discardPendingUpload(user.id, params.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, { params: t.Object({ id: t.String({ minLength: 1, maxLength: 128 }) }), auth: true });
}