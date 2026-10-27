// Retained legacy schema. Keep registered with Drizzle to avoid generating
// destructive migrations for existing permission data during the transition.
import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { user } from '../platform/users/schema';
import { channelMetadata } from './legacy-chat-schema';

type LegacyPermission = string;

export const role = sqliteTable('role', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    // Base permissions stored as a JSON array of strings
    permissions: text('permissions', { mode: 'json' })
        .$type<LegacyPermission[]>()
        .notNull()
        .default([]),
});

export const userRole = sqliteTable('user_role', {
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
    roleId: text('role_id').references(() => role.id, { onDelete: 'cascade' }).notNull(),
}, (table) => [
    primaryKey({ columns: [table.userId, table.roleId] })
]);

// Channel Overrides using the exact same JSON array approach
export const channelRoleOverride = sqliteTable('channel_role_override', {
    channelId: text('channel_id').references(() => channelMetadata.roomId, { onDelete: 'cascade' }).notNull(),
    roleId: text('role_id').references(() => role.id, { onDelete: 'cascade' }).notNull(),
    
    // Explicitly allowed or denied permissions for this role in this channel
    allowed: text('allowed', { mode: 'json' }).$type<LegacyPermission[]>().notNull().default([]),
    denied: text('denied', { mode: 'json' }).$type<LegacyPermission[]>().notNull().default([]),
}, (table) => [
    primaryKey({ columns: [table.channelId, table.roleId] })
]);