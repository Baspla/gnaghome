import { Elysia, t } from 'elysia';
import { Modules } from '$shared/constants';
import type { createAuthMiddleware } from '../auth';
import type { FilesService } from './service';

type FilesServiceDependency = Pick<FilesService, 'uploadFile' | 'getFile'>;

export function createFilesModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    filesService: FilesServiceDependency,
) {
    return new Elysia({ prefix: '/files', name: Modules.FILES })
        .use(authMiddleware)
        .get('/:id', async ({ user, params, status, set }) => {
            const result = await filesService.getFile(params.id, user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });

            set.headers['content-type'] = result.value.mimeType;
            set.headers['content-length'] = String(result.value.size);
            set.headers['content-disposition'] = 'inline';
            set.headers['x-content-type-options'] = 'nosniff';
            set.headers['cache-control'] = 'private, no-store';
            return result.value.bytes;
        }, {
            params: t.Object({ id: t.String({ minLength: 1, maxLength: 64 }) }),
            auth: true,
        })
        .post('/', async ({ user, body, status }) => {
            const result = await filesService.uploadFile(
                user.id,
                new Uint8Array(await body.file.arrayBuffer()),
            );
            if (!result.ok) return status(result.error.status, { error: result.error });
            return status(201, result.value);
        }, {
            body: t.Object({
                file: t.File({ maxSize: '10m' }),
            }),
            auth: true,
        });
}