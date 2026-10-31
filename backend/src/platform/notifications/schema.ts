import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from '../users/schema';

/** Applications register stable notification topics at backend startup. */
export const notificationTopic = sqliteTable('notification_topic', {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    label: text('label').notNull(),
    description: text('description').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [index('notification_topic_app_idx').on(table.appId, table.id)]);

export const notificationPreference = sqliteTable('notification_preference', {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    topicId: text('topic_id').notNull().references(() => notificationTopic.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
    primaryKey({ columns: [table.userId, table.topicId] }),
    index('notification_preference_topic_enabled_idx').on(table.topicId, table.enabled),
]);

/** Push endpoints and their keys are credentials: never return or log these values. */
export const pushSubscription = sqliteTable('push_subscription', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
    uniqueIndex('push_subscription_endpoint_uidx').on(table.endpoint),
    index('push_subscription_user_idx').on(table.userId),
]);

/** One random Europe/Berlin send time per calendar day; sentAt makes execution idempotent. */
export const dailyReminderSchedule = sqliteTable('notification_daily_reminder', {
    day: text('day').primaryKey(),
    dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [uniqueIndex('notification_daily_reminder_due_uidx').on(table.dueAt)]);

export type PushSubscriptionRecord = typeof pushSubscription.$inferSelect;