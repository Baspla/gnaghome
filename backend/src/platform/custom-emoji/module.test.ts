import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { createAuthMiddleware } from '../auth';
import { user } from '../users/schema';
import { FilesService } from '../files/service';
import { LocalFileStorage } from '../files/storage';
import { ok } from '../../lib/result';
import { createCustomEmojiModule } from './module';
import { CustomEmojiService } from './service';

const PNG_BYTES = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pJ8AAAAASUVORK5CYII=',
    'base64',
));

describe('custom emoji HTTP module', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let filesDirectory: string;
    let files: FilesService;
    let service: CustomEmojiService;
    let authenticated = true;
    let admin = false;
    let published: Array<{ channels: string[]; data: unknown }> = [];

    function app() {
        const auth = createAuthMiddleware(
            async () => authenticated ? {
                user: {
                    id: 'viewer', createdAt: new Date(), updatedAt: new Date(), name: 'Viewer',
                    email: 'viewer@example.test', emailVerified: true,
                    groups: admin ? '["admins"]' : '[]', image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
            'admins',
        );
        return new Elysia().use(createCustomEmojiModule(auth, service));
    }

    async function uploadRequest(name: string) {
        const form = new FormData();
        form.set('name', name);
        form.set('file', new File([PNG_BYTES], 'emoji.png', { type: 'image/png' }));
        return app().handle(new Request('http://localhost/custom-emojis', { method: 'POST', body: form }));
    }

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        filesDirectory = await mkdtemp(join(tmpdir(), 'gnaghome-custom-emoji-'));
        authenticated = true;
        admin = false;
        published = [];
        await database.db.insert(user).values([
            { id: 'viewer', name: 'Viewer', email: 'viewer@example.test' },
            { id: 'admin', name: 'Admin', email: 'admin@example.test' },
        ]);
        files = new FilesService(database.db, new LocalFileStorage(filesDirectory));
        service = new CustomEmojiService(database.db, files, async (channels, data) => {
            published.push({ channels, data });
            return ok(null);
        });
    });

    afterEach(async () => {
        database.close();
        await rm(filesDirectory, { recursive: true, force: true });
    });

    it('serves the custom emoji catalogue to signed-in users', async () => {
        admin = true;
        const created = await uploadRequest('gnag_wave');
        expect(created.status).toBe(201);

        admin = false;
        const response = await app().handle(new Request('http://localhost/custom-emojis'));

        expect(response.status).toBe(200);
        const catalog = await response.json() as { items: Array<{ name: string; fileId: string; url: string; mimeType: string; uploadedByUserId: string; uploadedByName: string }> };
        expect(catalog.items).toMatchObject([
            { name: 'gnag_wave', url: expect.stringMatching(/^\/api\/v1\/files\//), mimeType: 'image/png', uploadedByUserId: 'viewer', uploadedByName: 'Viewer' },
        ]);
        expect((await files.getFile(catalog.items[0]!.fileId, 'admin')).ok).toBe(true);
        expect(published).toEqual([{
            channels: ['public:custom-emojis'],
            data: expect.objectContaining({ type: 'custom-emojis.changed', data: {} }),
        }]);
    });

    it('restricts custom emoji upload to administrators and validates names', async () => {
        expect((await uploadRequest('gnag_wave')).status).toBe(403);

        admin = true;
        const invalidName = await uploadRequest('Not Valid!');

        expect(invalidName.status).toBe(400);
        expect((await app().handle(new Request('http://localhost/custom-emojis'))).status).toBe(200);
        expect(await (await app().handle(new Request('http://localhost/custom-emojis'))).json()).toEqual({ items: [] });
    });

    it('rejects duplicate names and lets administrators delete catalogue entries', async () => {
        admin = true;
        expect((await uploadRequest('gnag_wave')).status).toBe(201);
        expect((await uploadRequest('gnag_wave')).status).toBe(409);

        const deleted = await app().handle(new Request('http://localhost/custom-emojis/gnag_wave', { method: 'DELETE' }));
        expect(deleted.status).toBe(200);
        expect(published.map(({ data }) => (data as { type: string }).type)).toEqual([
            'custom-emojis.changed',
            'custom-emojis.changed',
        ]);

        admin = false;
        const catalogue = await app().handle(new Request('http://localhost/custom-emojis'));
        expect(await catalogue.json()).toEqual({ items: [] });

        expect((await app().handle(new Request('http://localhost/custom-emojis/gnag_wave', { method: 'DELETE' }))).status).toBe(403);

        admin = true;
        expect((await uploadRequest('gnag_wave')).status).toBe(201);
        admin = false;
        const recreated = await app().handle(new Request('http://localhost/custom-emojis'));
        expect(await recreated.json()).toMatchObject({ items: [{ name: 'gnag_wave' }] });
    });

    it('requires authentication for reads and administration', async () => {
        authenticated = false;
        expect((await app().handle(new Request('http://localhost/custom-emojis'))).status).toBe(401);
        expect((await uploadRequest('gnag_wave')).status).toBe(401);
        expect((await app().handle(new Request('http://localhost/custom-emojis/gnag_wave', { method: 'DELETE' }))).status).toBe(401);
    });
});