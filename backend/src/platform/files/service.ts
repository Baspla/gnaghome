import { randomUUID } from 'node:crypto';
import { and, eq, gt, lte, lt, or } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import type { AppDatabase } from '../../db/connection';
import { createLogger } from '../../lib/logger';
import { err, ok, type BadRequestError, type ForbiddenError, type InternalError, type NotFoundError, type Result } from '../../lib/result';
import { storedFile, type StoredFile } from './schema';
import { storageKeyFor, type FileStorage } from './storage';

const logger = createLogger('files');
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const DEFAULT_PENDING_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 100;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/apng',
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
]);

export type FileSummary = Pick<StoredFile, 'id' | 'uploadedByUserId' | 'mimeType' | 'size' | 'status' | 'isPrivate' | 'expiresAt' | 'createdAt'> & {
    url: string;
};

export type StoredFileContent = {
    id: string;
    mimeType: string;
    size: number;
    bytes: Uint8Array;
};

function toSummary(file: StoredFile): FileSummary {
    return {
        id: file.id,
        uploadedByUserId: file.uploadedByUserId,
        mimeType: file.mimeType,
        size: file.size,
        status: file.status,
        isPrivate: file.isPrivate,
        expiresAt: file.expiresAt,
        createdAt: file.createdAt,
        url: `/api/v1/files/${file.id}`,
    };
}

export class FilesService {
    constructor(
        private readonly db: AppDatabase,
        private readonly storage: FileStorage,
        private readonly maxFileSize = DEFAULT_MAX_FILE_SIZE,
    ) {}

    async uploadFile(
        uploaderUserId: string,
        bytes: Uint8Array,
    ): Promise<Result<FileSummary, BadRequestError | InternalError>> {
        if (!Number.isSafeInteger(this.maxFileSize) || this.maxFileSize < 1) {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'File storage is misconfigured' });
        }
        if (bytes.byteLength === 0) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Image file is empty' });
        }
        if (bytes.byteLength > this.maxFileSize) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Image exceeds the maximum allowed size' });
        }

        try {
            const detected = await fileTypeFromBuffer(bytes);
            if (!detected || !ALLOWED_IMAGE_MIME_TYPES.has(detected.mime)) {
                return err({ status: 400, code: 'BAD_REQUEST', message: 'Unsupported or invalid image file' });
            }

            const storageKey = storageKeyFor(detected.mime);
            const file: StoredFile = {
                id: randomUUID(),
                storageKey,
                uploadedByUserId: uploaderUserId,
                mimeType: detected.mime,
                size: bytes.byteLength,
                status: 'pending',
                isPrivate: true,
                expiresAt: new Date(Date.now() + DEFAULT_PENDING_UPLOAD_TTL_MS),
                createdAt: new Date(),
            };

            await this.storage.write(file.storageKey, bytes);
            try {
                await this.db.insert(storedFile).values(file);
            } catch (error) {
                await this.storage.delete(file.storageKey);
                throw error;
            }
            return ok(toSummary(file));
        } catch (error) {
            logger.error('failed to store image', { uploaderUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to store image' });
        }
    }

    async getFile(fileId: string, viewerUserId: string): Promise<Result<StoredFileContent, NotFoundError | InternalError>> {
        try {
            const [file] = await this.db.select().from(storedFile).where(eq(storedFile.id, fileId)).limit(1);
            if (!file
                || file.status === 'deleting'
                || (file.status === 'pending' && (!file.expiresAt || file.expiresAt.getTime() <= Date.now()))
                || (file.status === 'pending' && file.uploadedByUserId !== viewerUserId)
                || (file.status === 'ready' && file.isPrivate && file.uploadedByUserId !== viewerUserId)) {
                return err({ status: 404, code: 'NOT_FOUND', message: 'File not found' });
            }

            const bytes = await this.storage.read(file.storageKey);
            return ok({ id: file.id, mimeType: file.mimeType, size: file.size, bytes });
        } catch (error) {
            logger.error('failed to read image', { fileId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to read image' });
        }
    }

    /** Validate a pending image upload against the owning app's authenticated user. */
    async getOwnedPendingUpload(
        fileId: string,
        uploaderUserId: string,
    ): Promise<Result<FileSummary, BadRequestError | NotFoundError | ForbiddenError | InternalError>> {
        return this.getOwnedUpload(fileId, uploaderUserId, true);
    }

    /** Discard a caller-owned pending upload, never a file attached to a durable resource. */
    async discardPendingUpload(
        fileId: string,
        uploaderUserId: string,
    ): Promise<Result<null, BadRequestError | NotFoundError | ForbiddenError | InternalError>> {
        try {
            const [file] = await this.db.select().from(storedFile).where(eq(storedFile.id, fileId)).limit(1);
            if (!file || file.status !== 'pending' || !file.expiresAt || file.expiresAt.getTime() <= Date.now()) {
                return err({ status: 404, code: 'NOT_FOUND', message: 'Pending upload not found' });
            }
            if (file.uploadedByUserId !== uploaderUserId) {
                return err({ status: 403, code: 'FORBIDDEN', message: 'Only the uploader can discard this file' });
            }
            const [claimed] = await this.db.update(storedFile)
                .set({ status: 'deleting', isPrivate: true })
                .where(and(
                    eq(storedFile.id, fileId),
                    eq(storedFile.uploadedByUserId, uploaderUserId),
                    eq(storedFile.status, 'pending'),
                    gt(storedFile.expiresAt, new Date()),
                ))
                .returning({ id: storedFile.id });
            if (!claimed) return err({ status: 404, code: 'NOT_FOUND', message: 'Pending upload not found' });
            await this.storage.delete(file.storageKey);
            await this.db.delete(storedFile).where(and(eq(storedFile.id, fileId), eq(storedFile.status, 'deleting')));
            return ok(null);
        } catch (error) {
            logger.error('failed to discard pending image upload', { fileId, uploaderUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to discard pending upload' });
        }
    }

    private async getOwnedUpload(
        fileId: string,
        uploaderUserId: string,
        requirePending: boolean,
    ): Promise<Result<FileSummary, BadRequestError | NotFoundError | ForbiddenError | InternalError>> {
        try {
            const [file] = await this.db.select().from(storedFile).where(eq(storedFile.id, fileId)).limit(1);
            if (!file || file.status === 'deleting' || (file.status === 'pending' && (!file.expiresAt || file.expiresAt.getTime() <= Date.now()))) {
                return err({ status: 404, code: 'NOT_FOUND', message: 'File upload not found' });
            }
            if (file.uploadedByUserId !== uploaderUserId) {
                return err({ status: 403, code: 'FORBIDDEN', message: 'Only the uploader can attach this file' });
            }
            if (requirePending && file.status !== 'pending') {
                return err({ status: 400, code: 'BAD_REQUEST', message: 'File is already attached to a resource' });
            }
            if (!requirePending && file.status !== 'ready') {
                return err({ status: 404, code: 'NOT_FOUND', message: 'Attached file not found' });
            }
            return ok(toSummary(file));
        } catch (error) {
            logger.error('failed to validate pending image upload', { fileId, uploaderUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to validate image upload' });
        }
    }

    async finalizeUpload(
        fileId: string,
        uploaderUserId: string,
        isPrivate: boolean,
        now = new Date(),
    ): Promise<Result<FileSummary, NotFoundError | ForbiddenError | InternalError>> {
        try {
            const [file] = await this.db.select().from(storedFile).where(eq(storedFile.id, fileId)).limit(1);
            if (!file || file.status === 'deleting') {
                return err({ status: 404, code: 'NOT_FOUND', message: 'File not found' });
            }
            if (file.uploadedByUserId !== uploaderUserId) {
                return err({ status: 403, code: 'FORBIDDEN', message: 'Only the uploader can finalize this file' });
            }
            if (file.status === 'ready') {
                return ok(toSummary(file));
            }
            if (!file.expiresAt || file.expiresAt.getTime() <= now.getTime()) {
                return err({ status: 404, code: 'NOT_FOUND', message: 'File upload has expired' });
            }

            await this.db.update(storedFile)
                .set({ status: 'ready', isPrivate, expiresAt: null })
                .where(and(
                    eq(storedFile.id, fileId),
                    eq(storedFile.status, 'pending'),
                    gt(storedFile.expiresAt, now),
                ));
            const [finalized] = await this.db.select().from(storedFile).where(eq(storedFile.id, fileId)).limit(1);
            if (!finalized || finalized.status !== 'ready') {
                return err({ status: 404, code: 'NOT_FOUND', message: 'File upload has expired' });
            }
            return ok(toSummary(finalized));
        } catch (error) {
            logger.error('failed to finalize image upload', { fileId, uploaderUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to finalize image upload' });
        }
    }

    async cleanupExpiredUploads(now = new Date()): Promise<Result<number, InternalError>> {
        if (!Number.isFinite(now.getTime())) {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Invalid cleanup time' });
        }

        let deleted = 0;
        try {
            const expired = await this.db.select().from(storedFile)
                .where(or(
                    and(eq(storedFile.status, 'pending'), lte(storedFile.expiresAt, now)),
                    eq(storedFile.status, 'deleting'),
                ))
                .limit(CLEANUP_BATCH_SIZE);

            for (const file of expired) {
                const [claimed] = await this.db.update(storedFile)
                    .set({ status: 'deleting', isPrivate: true })
                    .where(file.status === 'pending'
                        ? and(eq(storedFile.id, file.id), eq(storedFile.status, 'pending'), lte(storedFile.expiresAt, now))
                        : and(eq(storedFile.id, file.id), eq(storedFile.status, 'deleting')))
                    .returning({ id: storedFile.id });
                if (!claimed) continue;

                try {
                    await this.storage.delete(file.storageKey);
                } catch (error) {
                    logger.warn('failed to delete expired image bytes; cleanup will retry', {
                        fileId: file.id,
                        error: String(error),
                    });
                    continue;
                }

                await this.db.delete(storedFile)
                    .where(and(eq(storedFile.id, file.id), eq(storedFile.status, 'deleting')));
                deleted++;
            }
            return ok(deleted);
        } catch (error) {
            logger.error('failed to clean up expired image uploads', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to clean up expired uploads' });
        }
    }

    async deleteFile(fileId: string): Promise<Result<null, NotFoundError | InternalError>> {
        try {
            const [file] = await this.db.select().from(storedFile).where(eq(storedFile.id, fileId)).limit(1);
            if (!file) return err({ status: 404, code: 'NOT_FOUND', message: 'File not found' });

            if (file.status !== 'deleting') {
                const [claimed] = await this.db.update(storedFile)
                    .set({ status: 'deleting', isPrivate: true })
                    .where(and(eq(storedFile.id, fileId), eq(storedFile.status, file.status)))
                    .returning({ id: storedFile.id });
                if (!claimed) return err({ status: 404, code: 'NOT_FOUND', message: 'File not found' });
            }

            await this.storage.delete(file.storageKey);
            await this.db.delete(storedFile).where(and(eq(storedFile.id, fileId), eq(storedFile.status, 'deleting')));
            return ok(null);
        } catch (error) {
            logger.error('failed to delete image', { fileId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to delete image' });
        }
    }
}