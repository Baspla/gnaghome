import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** A reserved global row and one row per user, all stored in a single table. */
export const counter = sqliteTable('counter', {
    id: text('id').primaryKey(),
    count: integer('count').notNull().default(0),
});
