import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from '../users/schema';

/** A user reaction attached to an app-owned resource through a namespaced target reference. */
export const reaction = sqliteTable('reaction', {
    id: text('id').primaryKey(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    uniqueIndex('reaction_target_user_uidx').on(table.targetType, table.targetId, table.userId),
    index('reaction_target_idx').on(table.targetType, table.targetId),
]);

export type Reaction = typeof reaction.$inferSelect;