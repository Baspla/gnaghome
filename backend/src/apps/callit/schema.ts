import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from '../../platform/users/schema';
import { discussion } from '../../platform/discussions/schema';

export const callItTracker = sqliteTable('callit_tracker', {
    id: text('id').primaryKey(),
    symbol: text('symbol').notNull().unique(),
    name: text('name').notNull(),
    currency: text('currency'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastPrice: real('last_price'),
    lastPriceAt: integer('last_price_at', { mode: 'timestamp' }),
    discussionId: text('discussion_id').references(() => discussion.id, { onDelete: 'restrict' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index('callit_tracker_active_idx').on(table.isActive, table.symbol),
    uniqueIndex('callit_tracker_discussion_uidx').on(table.discussionId),
]);

export const callItPriceCandle = sqliteTable('callit_price_candle', {
    trackerId: text('tracker_id').notNull().references(() => callItTracker.id, { onDelete: 'cascade' }),
    interval: text('interval', { enum: ['1h', '1d'] }).notNull(),
    ts: integer('ts', { mode: 'timestamp' }).notNull(),
    open: real('open').notNull(),
    high: real('high').notNull(),
    low: real('low').notNull(),
    close: real('close').notNull(),
    volume: integer('volume'),
}, (table) => [
    primaryKey({ columns: [table.trackerId, table.interval, table.ts] }),
]);

export const callItPrediction = sqliteTable('callit_prediction', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    trackerId: text('tracker_id').notNull().references(() => callItTracker.id, { onDelete: 'restrict' }),
    direction: text('direction', { enum: ['UP', 'DOWN'] }).notNull(),
    durationKey: text('duration_key', { enum: ['1d', '2d', '3d', '5d', '7d', '1m'] }).notNull(),
    wager: integer('wager').notNull(),
    startPrice: real('start_price').notNull(),
    startAt: integer('start_at', { mode: 'timestamp' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
    status: text('status', { enum: ['ACTIVE', 'COMPLETED'] }).notNull().default('ACTIVE'),
    endPrice: real('end_price'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
    profitLoss: integer('profit_loss'),
    priceChangePercent: real('price_change_percent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index('callit_prediction_user_status_idx').on(table.userId, table.status, table.createdAt),
    index('callit_prediction_tracker_status_idx').on(table.trackerId, table.status, table.createdAt),
    index('callit_prediction_due_idx').on(table.status, table.endsAt),
]);

export const callItSettings = sqliteTable('callit_settings', {
    id: text('id').primaryKey(),
    updateIntervalMinutes: integer('update_interval_minutes').notNull().default(15),
    maxActivePredictionsPerUser: integer('max_active_predictions_per_user').notNull().default(6),
    lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
    lastSyncError: text('last_sync_error'),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type CallItTracker = typeof callItTracker.$inferSelect;
export type CallItPriceCandle = typeof callItPriceCandle.$inferSelect;
export type CallItPrediction = typeof callItPrediction.$inferSelect;
export type CallItSettings = typeof callItSettings.$inferSelect;
