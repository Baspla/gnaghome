import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { createAuthMiddleware } from '../auth';
import type { CustomEmojiService } from './service';

type CustomEmojiServiceDependency = Pick<CustomEmojiService, 'getCatalog' | 'createEmoji' | 'deleteEmoji'>;

export function createCustomEmojiModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    service: CustomEmojiServiceDependency,
) {
    return new Elysia({ prefix: '/custom-emojis', name: Modules.CUSTOM_EMOJI })
        .use(authMiddleware)
        .get('/', async ({ status }) => {
            const result = await service.getCatalog();
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { items: result.value.map((emoji) => ({
                ...emoji,
                createdAt: emoji.createdAt.toISOString(),
            })) };
        }, { auth: true })
        .post('/', async ({ user, body, status }) => {
            if (!user.isAdmin) return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Custom Emojis verwalten.' } });
            const result = await service.createEmoji(body.name, user.id, new Uint8Array(await body.file.arrayBuffer()));
            if (!result.ok) return status(result.error.status, { error: result.error });
            return status(201, {
                ...result.value,
                createdAt: result.value.createdAt.toISOString(),
            });
        }, {
            body: t.Object({
                name: t.String({ minLength: 1, maxLength: 32 }),
                file: t.File({ maxSize: '10m' }),
            }),
            auth: true,
        })
        .delete('/:name', async ({ user, params, status }) => {
            if (!user.isAdmin) return status(403, { error: { status: 403, code: 'FORBIDDEN', message: 'Nur Administratoren können Custom Emojis verwalten.' } });
            const result = await service.deleteEmoji(params.name);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { success: true };
        }, {
            params: t.Object({ name: t.String({ minLength: 1, maxLength: 32 }) }),
            auth: true,
        });
}