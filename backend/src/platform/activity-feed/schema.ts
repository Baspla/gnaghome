import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { user } from '../users/schema';

/**
 * Durable app-generated feed entries. Targets intentionally have no foreign
 * key: their records and access policies remain owned by their app modules.
 */
export const activityFeedItem = sqliteTable('activity_feed_item', {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    subjectUserId: text('subject_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetType: text('target_type'),
    targetId: text('target_id'),
    data: text('data').notNull().default('{}'),
    occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .$defaultFn(() => new Date())
        .notNull(),
}, (table) => [
    check(
        'activity_feed_item_target_pair_check',
        sql`(${table.targetType} is null) = (${table.targetId} is null)`,
    ),
    index('activity_feed_item_order_idx').on(table.occurredAt, table.id),
    index('activity_feed_item_actor_idx').on(table.actorUserId),
    index('activity_feed_item_subject_idx').on(table.subjectUserId),
    index('activity_feed_item_target_idx').on(table.targetType, table.targetId),
    uniqueIndex('activity_feed_item_crewnow_post_uidx')
        .on(table.targetType, table.targetId)
        .where(sql`${table.type} = 'crewnow.image_posted'`),
]);