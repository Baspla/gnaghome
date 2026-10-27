import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { user } from '../users/schema';

export const session = sqliteTable(
    'session',
    {
        id: text('id').primaryKey(),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        token: text('token').notNull().unique(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .$defaultFn(() => new Date())
            .notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .$onUpdate(() => new Date())
            .notNull(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = sqliteTable(
    'account',
    {
        id: text('id').primaryKey(),
        accountId: text('account_id').notNull(),
        providerId: text('provider_id').notNull(),
        issuer: text('issuer').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('access_token'),
        refreshToken: text('refresh_token'),
        idToken: text('id_token'),
        accessTokenExpiresAt: integer('access_token_expires_at', {
            mode: 'timestamp',
        }),
        refreshTokenExpiresAt: integer('refresh_token_expires_at', {
            mode: 'timestamp',
        }),
        scope: text('scope'),
        password: text('password'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .$defaultFn(() => new Date())
            .notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index('account_userId_idx').on(table.userId),
        uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId),
    ],
);

export const verification = sqliteTable(
    'verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .$defaultFn(() => new Date())
            .notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .$defaultFn(() => new Date())
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;