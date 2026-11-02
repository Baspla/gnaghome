import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { storedFile } from '../files/schema';

export const customEmoji = sqliteTable('custom_emoji', {
    name: text('name').primaryKey(),
    fileId: text('file_id').notNull().unique().references(() => storedFile.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [index('custom_emoji_created_idx').on(table.createdAt, table.name)]);

export type CustomEmojiRecord = typeof customEmoji.$inferSelect;