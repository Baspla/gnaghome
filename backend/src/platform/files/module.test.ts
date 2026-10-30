import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { user } from '../users/schema';
import { createAuthMiddleware } from '../auth';
import { FilesService } from './service';
import { LocalFileStorage } from './storage';
import { createFilesModule } from './module';

const PNG_BYTES = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pJ8AAAAASUVORK5CYII=',
    'base64',
));

describe('Files HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let directory: string;
    let service: FilesService;
    let session: {
        user: { id: string; createdAt: Date; updatedAt: Date; name: string; email: string; emailVerified: boolean; groups: string; image: string | null };
        session: { id: string };
    } | null;

    function app() {
        const authMiddleware = createAuthMiddleware(
            async () => session,
            async () => new Response('auth handler'),
        );
        return new Elysia().group('/api/v1', (api) => api.use(createFilesModule(authMiddleware, service)));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        directory = await mkdtemp(join(tmpdir(), 'gnaghome-files-http-'));
        service = new FilesService(database.db, new LocalFileStorage(directory));
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
        session = {
            user: {
                id: 'user-1',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                name: 'Alice',
                email: 'alice@example.test',
                emailVerified: true,
                groups: '[]',
                image: null,
            },
            session: { id: 'session-1' },
        };
    });

    afterEach(async () => {
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('requires a Gnaghome session to read and upload files', async () => {
        session = null;
        const readResponse = await app().handle(new Request('http://localhost/api/v1/files/opaque-id'));
        const form = new FormData();
        form.set('file', new File([PNG_BYTES], 'photo.png', { type: 'image/png' }));
        const uploadResponse = await app().handle(new Request('http://localhost/api/v1/files', {
            method: 'POST',
            body: form,
        }));
        expect(readResponse.status).toBe(401);
        expect(uploadResponse.status).toBe(401);
    });

    it('does not expose a generic delete route that can break app-owned file references', async () => {
        const response = await app().handle(new Request('http://localhost/api/v1/files/opaque-id', { method: 'DELETE' }));

        expect(response.status).toBe(404);
    });

    it('uploads an image and serves it at a direct /api/v1/files/{id} URL', async () => {
        const form = new FormData();
        form.set('file', new File([PNG_BYTES], 'photo.png', { type: 'image/png' }));
        const uploadResponse = await app().handle(new Request('http://localhost/api/v1/files', {
            method: 'POST',
            body: form,
        }));
        const metadata = await uploadResponse.json() as { id: string; url: string; mimeType: string; status: string; isPrivate: boolean };

        expect(uploadResponse.status).toBe(201);
        expect(metadata.url).toBe(`/api/v1/files/${metadata.id}`);
        expect(metadata.mimeType).toBe('image/png');
        expect(metadata).toMatchObject({ status: 'pending', isPrivate: true });

        session = {
            user: {
                id: 'user-2',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                name: 'Bob',
                email: 'bob@example.test',
                emailVerified: true,
                groups: '[]',
                image: null,
            },
            session: { id: 'session-2' },
        };
        const pendingResponse = await app().handle(new Request(`http://localhost${metadata.url}`));
        expect(pendingResponse.status).toBe(404);
        const finalized = await service.finalizeUpload(metadata.id, 'user-1', false);
        expect(finalized.ok).toBe(true);
        const fileResponse = await app().handle(new Request(`http://localhost${metadata.url}`));
        expect(fileResponse.status).toBe(200);
        expect(fileResponse.headers.get('content-type')).toBe('image/png');
        expect(fileResponse.headers.get('content-disposition')).toBe('inline');
        expect(fileResponse.headers.get('x-content-type-options')).toBe('nosniff');
        expect(fileResponse.headers.get('cache-control')).toBe('private, no-store');
        expect(new Uint8Array(await fileResponse.arrayBuffer())).toEqual(PNG_BYTES);
    });

    it('hides private files from other users', async () => {
        const form = new FormData();
        form.set('file', new File([PNG_BYTES], 'private.png', { type: 'image/png' }));
        const uploadResponse = await app().handle(new Request('http://localhost/api/v1/files', {
            method: 'POST',
            body: form,
        }));
        const metadata = await uploadResponse.json() as { id: string };

        await service.finalizeUpload(metadata.id, 'user-1', true);

        session = {
            user: {
                id: 'user-2',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                name: 'Bob',
                email: 'bob@example.test',
                emailVerified: true,
                groups: '[]',
                image: null,
            },
            session: { id: 'session-2' },
        };

        const response = await app().handle(new Request(`http://localhost/api/v1/files/${metadata.id}`));
        expect(response.status).toBe(404);
    });
});