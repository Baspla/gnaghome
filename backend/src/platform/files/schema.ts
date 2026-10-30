import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from '../users/schema';

export const storedFile = sqliteTable('stored_file', {
    id: text('id').primaryKey(),
    storageKey: text('storage_key').notNull().unique(),
    uploadedByUserId: text('uploaded_by_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    // Existing files migrate as ready; newly uploaded files explicitly start pending.
    status: text('status', { enum: ['pending', 'ready', 'deleting'] }).notNull().default('ready'),
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index('stored_file_uploader_idx').on(table.uploadedByUserId),
    index('stored_file_expiry_idx').on(table.status, table.expiresAt),
]);

export type StoredFile = typeof storedFile.$inferSelect;