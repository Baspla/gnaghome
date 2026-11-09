import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { account, session } from '../auth/schema';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', { mode: 'boolean' })
		.default(false)
		.notNull(),
	image: text('image'),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date())
		.notNull(),
	groups: text('groups').default('[]'),
});

export const userProfile = sqliteTable('user_profile', {
	userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
	bio: text('bio'),
	accentColor: text('accent_color').default('#6366f1').notNull(),
});

export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	profile: one(userProfile, {
		fields: [user.id],
		references: [userProfile.userId],
	}),
}));

export const userProfileRelations = relations(userProfile, ({ one }) => ({
	user: one(user, {
		fields: [userProfile.userId],
		references: [user.id],
	}),
}));

export type User = typeof user.$inferSelect;
export type UserProfile = typeof userProfile.$inferSelect;
export type UserWithProfile = User & Pick<UserProfile, 'bio' | 'accentColor'>;

export type RedactedUser = Pick<UserWithProfile, 'id' | 'name' | 'image' | 'createdAt' | 'bio' | 'accentColor'>;