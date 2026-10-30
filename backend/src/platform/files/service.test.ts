import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../db/connection';
import { user } from '../users/schema';
import { storedFile } from './schema';
import { LocalFileStorage, type FileStorage } from './storage';
import { FilesService } from './service';

const PNG_BYTES = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pJ8AAAAASUVORK5CYII=',
    'base64',
));

describe('FilesService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let directory: string;
    let storage: LocalFileStorage;
    let service: FilesService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        directory = await mkdtemp(join(tmpdir(), 'gnaghome-files-'));
        storage = new LocalFileStorage(directory);
        service = new FilesService(database.db, storage);
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
    });

    afterEach(async () => {
        database.close();
        await rm(directory, { recursive: true, force: true });
    });

    it('stores uploads as pending and private until an owning app finalizes them', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);

        expect(upload.ok).toBe(true);
        if (!upload.ok) return;
        expect(upload.value).toMatchObject({
            uploadedByUserId: 'user-1',
            status: 'pending',
            isPrivate: true,
            mimeType: 'image/png',
            size: PNG_BYTES.byteLength,
            url: `/api/v1/files/${upload.value.id}`,
        });
        expect(upload.value.expiresAt).toBeInstanceOf(Date);
        expect(upload.value.id).not.toContain('/');

        const ownerRead = await service.getFile(upload.value.id, 'user-1');
        const otherRead = await service.getFile(upload.value.id, 'user-2');
        expect(ownerRead.ok).toBe(true);
        expect(otherRead).toMatchObject({ ok: false, error: { status: 404 } });
    });

    it('finalizes a pending upload once attached and allows the requested visibility', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);
        expect(upload.ok).toBe(true);
        if (!upload.ok) return;

        const finalized = await service.finalizeUpload(upload.value.id, 'user-1', false);

        expect(finalized.ok).toBe(true);
        if (!finalized.ok) return;
        expect(finalized.value).toMatchObject({ status: 'ready', isPrivate: false, expiresAt: null });
        expect((await service.getFile(upload.value.id, 'user-2')).ok).toBe(true);

        const retry = await service.finalizeUpload(upload.value.id, 'user-1', false);
        expect(retry).toEqual(finalized);
    });

    it('allows only the uploader to finalize and rejects expired pending uploads', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);
        expect(upload.ok).toBe(true);
        if (!upload.ok) return;

        const denied = await service.finalizeUpload(upload.value.id, 'user-2', false);
        expect(denied).toMatchObject({ ok: false, error: { status: 403 } });

        const expired = await service.finalizeUpload(upload.value.id, 'user-1', false, new Date(Date.now() + 25 * 60 * 60 * 1000));
        expect(expired).toMatchObject({ ok: false, error: { status: 404 } });
    });

    it('cleans expired pending uploads while retaining unexpired and finalized files', async () => {
        const abandoned = await service.uploadFile('user-1', PNG_BYTES);
        const pending = await service.uploadFile('user-1', PNG_BYTES);
        const attached = await service.uploadFile('user-1', PNG_BYTES);
        expect(abandoned.ok && pending.ok && attached.ok).toBe(true);
        if (!abandoned.ok || !pending.ok || !attached.ok) return;

        const now = new Date();
        const abandonedRow = (await database.db.select().from(storedFile).where(eq(storedFile.id, abandoned.value.id)))[0];
        if (!abandonedRow) throw new Error('Expected abandoned file row');
        await database.db.update(storedFile).set({ expiresAt: new Date(now.getTime() - 60_000) }).where(eq(storedFile.id, abandoned.value.id));
        await database.db.update(storedFile).set({ expiresAt: new Date(now.getTime() + 60 * 60 * 1000) }).where(eq(storedFile.id, pending.value.id));
        await service.finalizeUpload(attached.value.id, 'user-1', false);

        const cleanup = await service.cleanupExpiredUploads(now);

        expect(cleanup).toEqual({ ok: true, value: 1 });
        expect(await service.getFile(abandoned.value.id, 'user-1')).toMatchObject({ ok: false });
        expect((await service.getFile(pending.value.id, 'user-1')).ok).toBe(true);
        expect((await service.getFile(attached.value.id, 'user-2')).ok).toBe(true);
        await expect(readFile(join(directory, abandonedRow.storageKey))).rejects.toThrow();
    });

    it('retries cleanup records left in deleting state after a storage failure', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);
        expect(upload.ok).toBe(true);
        if (!upload.ok) return;
        await database.db.update(storedFile).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(storedFile.id, upload.value.id));

        const failingStorage: FileStorage = {
            write: async () => {},
            read: async () => PNG_BYTES,
            delete: async () => { throw new Error('temporary storage failure'); },
        };
        const failedCleanup = await new FilesService(database.db, failingStorage).cleanupExpiredUploads();
        expect(failedCleanup).toEqual({ ok: true, value: 0 });
        const [claimed] = await database.db.select().from(storedFile).where(eq(storedFile.id, upload.value.id));
        expect(claimed?.status).toBe('deleting');

        const retryCleanup = await service.cleanupExpiredUploads();
        expect(retryCleanup).toEqual({ ok: true, value: 1 });
        expect(await service.getFile(upload.value.id, 'user-1')).toMatchObject({ ok: false });
    });

    it('allows only the uploader to read a private file', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);
        expect(upload.ok).toBe(true);
        if (!upload.ok) return;
        await service.finalizeUpload(upload.value.id, 'user-1', true);

        const ownerRead = await service.getFile(upload.value.id, 'user-1');
        const otherRead = await service.getFile(upload.value.id, 'user-2');

        expect(ownerRead.ok).toBe(true);
        expect(otherRead).toEqual({
            ok: false,
            error: { status: 404, code: 'NOT_FOUND', message: 'File not found' },
        });
    });

    it('detects supported image type from bytes rather than trusting caller metadata', async () => {
        const result = await service.uploadFile('user-1', new Uint8Array([1, 2, 3, 4]));

        expect(result).toEqual({
            ok: false,
            error: { status: 400, code: 'BAD_REQUEST', message: 'Unsupported or invalid image file' },
        });
    });

    it('rejects a detected image type outside the initial browser-image set', async () => {
        const bmp = Uint8Array.from([0x42, 0x4d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
        const result = await service.uploadFile('user-1', bmp);

        expect(result).toEqual({
            ok: false,
            error: { status: 400, code: 'BAD_REQUEST', message: 'Unsupported or invalid image file' },
        });
    });

    it('rejects files above the configured maximum size', async () => {
        const limitedService = new FilesService(database.db, storage, 8);
        const result = await limitedService.uploadFile('user-1', PNG_BYTES);

        expect(result).toEqual({
            ok: false,
            error: { status: 400, code: 'BAD_REQUEST', message: 'Image exceeds the maximum allowed size' },
        });
    });

    it('lets an authorized owning module delete a file and removes its metadata and bytes', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);
        expect(upload.ok).toBe(true);
        if (!upload.ok) return;
        await service.finalizeUpload(upload.value.id, 'user-1', false);

        const [metadataBeforeDelete] = await database.db.select().from(storedFile).where(eq(storedFile.id, upload.value.id));
        expect(metadataBeforeDelete).toBeDefined();
        const storedPath = metadataBeforeDelete ? join(directory, metadataBeforeDelete.storageKey) : '';
        expect(await readFile(storedPath)).toEqual(Buffer.from(PNG_BYTES));

        const deleted = await service.deleteFile(upload.value.id);
        expect(deleted).toEqual({ ok: true, value: null });
        expect(await service.getFile(upload.value.id, 'user-1')).toMatchObject({ ok: false });
        const [metadata] = await database.db.select().from(storedFile).where(eq(storedFile.id, upload.value.id));
        expect(metadata).toBeUndefined();
        await expect(readFile(storedPath)).rejects.toThrow();
    });

    it('hides app-deleted files and lets the scheduled cleanup retry a storage failure', async () => {
        const upload = await service.uploadFile('user-1', PNG_BYTES);
        expect(upload.ok).toBe(true);
        if (!upload.ok) return;
        await service.finalizeUpload(upload.value.id, 'user-1', false);

        const failingStorage: FileStorage = {
            write: async () => {},
            read: async () => PNG_BYTES,
            delete: async () => { throw new Error('temporary storage failure'); },
        };
        const failedDelete = await new FilesService(database.db, failingStorage).deleteFile(upload.value.id);
        expect(failedDelete.ok).toBe(false);
        expect(await service.getFile(upload.value.id, 'user-2')).toMatchObject({ ok: false });

        const retried = await service.cleanupExpiredUploads();
        expect(retried).toEqual({ ok: true, value: 1 });
        expect(await service.getFile(upload.value.id, 'user-1')).toMatchObject({ ok: false });
    });

    it('rejects path traversal keys in the local storage adapter', async () => {
        await expect(storage.read('../outside.png')).rejects.toThrow('Invalid internal file storage key');
        await expect(storage.delete('../outside.png')).rejects.toThrow('Invalid internal file storage key');
    });

    it('removes stored bytes if metadata persistence fails', async () => {
        const failingStorage: FileStorage & { deleted: string[] } = {
            deleted: [],
            write: async () => {},
            read: async () => PNG_BYTES,
            delete: async (storageKey) => { failingStorage.deleted.push(storageKey); },
        };
        const failingService = new FilesService(database.db, failingStorage);
        const result = await failingService.uploadFile('missing-user', PNG_BYTES);

        expect(result.ok).toBe(false);
        expect(failingStorage.deleted).toHaveLength(1);
    });
});