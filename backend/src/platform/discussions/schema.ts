import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from '../users/schema';

/** A reusable discussion attached to a resource owned and authorized by an app. */
export const discussion = sqliteTable('discussion', {
    id: text('id').primaryKey(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    uniqueIndex('discussion_target_uidx').on(table.targetType, table.targetId),
    index('discussion_target_type_idx').on(table.targetType),
]);

export const discussionMessage = sqliteTable('discussion_message', {
    id: text('id').primaryKey(),
    discussionId: text('discussion_id').notNull().references(() => discussion.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
    editedAt: integer('edited_at', { mode: 'timestamp' }),
}, (table) => [
    index('discussion_message_order_idx').on(table.discussionId, table.createdAt, table.id),
    index('discussion_message_author_idx').on(table.authorUserId),
]);

export type Discussion = typeof discussion.$inferSelect;
export type DiscussionMessage = typeof discussionMessage.$inferSelect;