// Retained legacy schema. Keep registered with Drizzle to avoid generating
// destructive migrations for existing chat data during the product transition.
import { sqliteTable, text, integer, uniqueIndex, primaryKey, check, index } from 'drizzle-orm/sqlite-core';
import { user } from '../platform/users/schema';
import { sql } from 'drizzle-orm/sql';

// 1. The Core Supertype (Lifecycle & Shared State)
export const room = sqliteTable('room', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text('type', { enum: ['channel', 'dm'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// 2. Subtype Extension: Channel Metadata
export const channelMetadata = sqliteTable('channel_metadata', {
  roomId: text('room_id').primaryKey().references(() => room.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
});

// 3. Subtype Extension: DM Metadata
export const dmMetadata = sqliteTable('dm_metadata', {
  roomId: text('room_id').primaryKey().references(() => room.id, { onDelete: 'cascade' }),
  userAId: text('user_a_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  userBId: text('user_b_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [
  uniqueIndex('dm_metadata_participants_idx').on(table.userAId, table.userBId),
  check('dm_metadata_participants_order_check', sql`(${table.userAId} < ${table.userBId})`),
]);

// 4. The Unified Messages Table
export const message = sqliteTable('message', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    roomId: text('room_id').references(() => room.id, { onDelete: 'cascade' }).notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    index('message_room_created_idx').on(table.roomId, table.createdAt, table.id),
]);

export const roomReadState = sqliteTable('room_read_state', {
    roomId: text('room_id')
        .references(() => room.id, { onDelete: 'cascade' })
        .notNull(),
    userId: text('user_id')
        .references(() => user.id, { onDelete: 'cascade' })
        .notNull(),
    lastReadAt: integer('last_read_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
}, (table) => [
    primaryKey({ columns: [table.roomId, table.userId] })
]);

export type Room = typeof room.$inferSelect;
export type ChannelMetadata = typeof channelMetadata.$inferSelect;
export type DirectMessageMetadata = typeof dmMetadata.$inferSelect;
export type Message = typeof message.$inferSelect;