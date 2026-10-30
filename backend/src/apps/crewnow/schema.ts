import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from '../../platform/users/schema';
import { storedFile } from '../../platform/files/schema';
import { discussion } from '../../platform/discussions/schema';

export const crewNowPost = sqliteTable('crewnow_post', {
    id: text('id').primaryKey(),
    authorUserId: text('author_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    backImageFileId: text('back_image_file_id').notNull().references(() => storedFile.id, { onDelete: 'restrict' }),
    frontImageFileId: text('front_image_file_id').notNull().references(() => storedFile.id, { onDelete: 'restrict' }),
    discussionId: text('discussion_id').references(() => discussion.id, { onDelete: 'restrict' }),
    caption: text('caption'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [
    index('crewnow_post_timeline_idx').on(table.createdAt, table.id),
    index('crewnow_post_author_idx').on(table.authorUserId),
    uniqueIndex('crewnow_post_back_file_uidx').on(table.backImageFileId),
    uniqueIndex('crewnow_post_front_file_uidx').on(table.frontImageFileId),
]);

export const crewNowPostTag = sqliteTable('crewnow_post_tag', {
    postId: text('post_id').notNull().references(() => crewNowPost.id, { onDelete: 'cascade' }),
    taggedUserId: text('tagged_user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
}, (table) => [
    index('crewnow_post_tag_post_idx').on(table.postId, table.position),
    index('crewnow_post_tag_user_idx').on(table.taggedUserId),
    uniqueIndex('crewnow_post_tag_pair_uidx').on(table.postId, table.taggedUserId),
]);

export type CrewNowPost = typeof crewNowPost.$inferSelect;