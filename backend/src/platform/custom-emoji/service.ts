import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { createLogger } from '../../lib/logger';
import { err, ok, type BadRequestError, type ConflictError, type ForbiddenError, type InternalError, type NotFoundError, type Result } from '../../lib/result';
import type { FilesService, FileSummary } from '../files/service';
import type { BroadcastPublisher } from '../realtime/service';
import { RealtimeChannels } from '$shared/constants';
import type { CustomEmojisChangedEvent } from '$shared/dto/platform-event';
import { customEmoji } from './schema';
import { storedFile } from '../files/schema';
import { user } from '../users/schema';

const logger = createLogger('custom-emoji');
export const CUSTOM_EMOJI_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export type CustomEmojiSummary = {
    name: string;
    fileId: string;
    url: string;
    mimeType: string;
    createdAt: Date;
    uploadedByUserId: string;
    uploadedByName: string;
};

type CustomEmojiError = BadRequestError | ConflictError | ForbiddenError | InternalError | NotFoundError;

function validEmojiName(name: unknown): name is string {
    return typeof name === 'string' && CUSTOM_EMOJI_NAME_PATTERN.test(name);
}

function toSummary(
    record: typeof customEmoji.$inferSelect,
    file: Pick<FileSummary, 'url' | 'mimeType'>,
    uploadedByUserId: string,
    uploadedByName: string,
): CustomEmojiSummary {
    return {
        name: record.name,
        fileId: record.fileId,
        url: file.url,
        mimeType: file.mimeType,
        createdAt: record.createdAt,
        uploadedByUserId,
        uploadedByName,
    };
}

export class CustomEmojiService {
    constructor(
        private readonly db: AppDatabase,
        private readonly files: Pick<FilesService, 'uploadFile' | 'finalizeUpload' | 'discardPendingUpload' | 'deleteFile'>,
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async getCatalog(): Promise<Result<CustomEmojiSummary[], InternalError>> {
        try {
            const rows = await this.db.select({
                name: customEmoji.name,
                fileId: customEmoji.fileId,
                createdAt: customEmoji.createdAt,
                mimeType: storedFile.mimeType,
                isPrivate: storedFile.isPrivate,
                uploadedByUserId: storedFile.uploadedByUserId,
                uploadedByName: user.name,
            }).from(customEmoji)
                .innerJoin(storedFile, eq(storedFile.id, customEmoji.fileId))
                .innerJoin(user, eq(user.id, storedFile.uploadedByUserId))
                .where(eq(storedFile.status, 'ready'))
                .orderBy(customEmoji.name);
            return ok(rows.filter((row) => !row.isPrivate).map((row) => ({
                name: row.name,
                fileId: row.fileId,
                url: `/api/v1/files/${row.fileId}`,
                mimeType: row.mimeType,
                createdAt: row.createdAt,
                uploadedByUserId: row.uploadedByUserId,
                uploadedByName: row.uploadedByName,
            })));
        } catch (error) {
            logger.error('failed to load custom emoji catalogue', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Custom Emojis konnten nicht geladen werden.' });
        }
    }

    async createEmoji(name: string, uploaderUserId: string, bytes: Uint8Array): Promise<Result<CustomEmojiSummary, CustomEmojiError>> {
        if (!validEmojiName(name)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Der Emoji-Name muss 1 bis 32 Zeichen lang sein und darf nur Kleinbuchstaben, Zahlen, _ und - enthalten.' });
        }

        try {
            const [existing] = await this.db.select({ name: customEmoji.name }).from(customEmoji).where(eq(customEmoji.name, name)).limit(1);
            if (existing) return err({ status: 409, code: 'CONFLICT', message: 'Dieser Emoji-Name ist bereits vergeben.' });
        } catch (error) {
            logger.error('failed to check custom emoji name', { name, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Der Emoji-Name konnte nicht geprüft werden.' });
        }

        let uploaderName: string;
        try {
            const [uploader] = await this.db.select({ name: user.name }).from(user).where(eq(user.id, uploaderUserId)).limit(1);
            if (!uploader) return err({ status: 404, code: 'NOT_FOUND', message: 'Uploader nicht gefunden.' });
            uploaderName = uploader.name;
        } catch (error) {
            logger.error('failed to load custom emoji uploader', { uploaderUserId, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Uploader konnte nicht geladen werden.' });
        }

        const uploaded = await this.files.uploadFile(uploaderUserId, bytes);
        if (!uploaded.ok) return uploaded;

        const finalized = await this.files.finalizeUpload(uploaded.value.id, uploaderUserId, false);
        if (!finalized.ok) {
            await this.files.discardPendingUpload(uploaded.value.id, uploaderUserId);
            return finalized;
        }

        const createdAt = this.clock();
        try {
            const [record] = await this.db.insert(customEmoji).values({
                name,
                fileId: finalized.value.id,
                createdAt,
            }).returning();
            if (!record) throw new Error('Custom emoji insert returned no row');
            await this.publishChanged();
            return ok(toSummary(record, finalized.value, uploaderUserId, uploaderName));
        } catch (error) {
            await this.files.deleteFile(finalized.value.id);
            try {
                const [existing] = await this.db.select({ name: customEmoji.name }).from(customEmoji).where(eq(customEmoji.name, name)).limit(1);
                if (existing) return err({ status: 409, code: 'CONFLICT', message: 'Dieser Emoji-Name ist bereits vergeben.' });
            } catch {
                // Return the original persistence failure below.
            }
            logger.error('failed to create custom emoji', { name, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Das Custom Emoji konnte nicht gespeichert werden.' });
        }
    }

    async deleteEmoji(name: string): Promise<Result<null, NotFoundError | InternalError>> {
        if (!validEmojiName(name)) return err({ status: 404, code: 'NOT_FOUND', message: 'Custom Emoji nicht gefunden.' });
        try {
            const [deleted] = await this.db.delete(customEmoji).where(eq(customEmoji.name, name)).returning();
            if (!deleted) return err({ status: 404, code: 'NOT_FOUND', message: 'Custom Emoji nicht gefunden.' });

            const fileDeletion = await this.files.deleteFile(deleted.fileId);
            if (!fileDeletion.ok) {
                logger.warn('custom emoji removed but its file cleanup will need retry', {
                    name,
                    fileId: deleted.fileId,
                    error: fileDeletion.error.message,
                });
            }
            await this.publishChanged();
            return ok(null);
        } catch (error) {
            logger.error('failed to delete custom emoji', { name, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Das Custom Emoji konnte nicht gelöscht werden.' });
        }
    }

    private async publishChanged(): Promise<void> {
        const event: CustomEmojisChangedEvent = {
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'custom-emojis.changed',
            data: {},
        };
        try {
            const result = await this.broadcast([RealtimeChannels.CUSTOM_EMOJIS], event);
            if (!result.ok) logger.warn('custom emoji invalidation failed', { message: result.error.message });
        } catch (error) {
            logger.warn('custom emoji invalidation failed', { error: String(error) });
        }
    }
}