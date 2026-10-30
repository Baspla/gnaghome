import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createDatabase } from './connection';

describe('SQLite integration', () => {
    it('applies production migrations and preserves the activity-feed schema', async () => {
        const connection = await createDatabase(':memory:');
        try {
            const { db } = connection;
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = \'table\'') as { name: string }[];
            expect(tables.map((table) => table.name)).toContain('user');
            expect(tables.map((table) => table.name)).toContain('activity_feed_item');
            expect(tables.map((table) => table.name)).toContain('stored_file');
            expect(tables.map((table) => table.name)).toContain('discussion');
            expect(tables.map((table) => table.name)).toContain('discussion_message');
            const fileColumns = await db.all('PRAGMA table_info(stored_file)') as { name: string }[];
            expect(fileColumns.map((column) => column.name)).toEqual([
                'id',
                'storage_key',
                'uploaded_by_user_id',
                'mime_type',
                'size',
                'is_private',
                'created_at',
                'status',
                'expires_at',
            ]);
            const fileForeignKeys = await db.all('PRAGMA foreign_key_list(stored_file)') as { table: string; from: string; on_delete: string }[];
            expect(fileForeignKeys).toHaveLength(1);
            expect(fileForeignKeys[0]).toMatchObject({ table: 'user', from: 'uploaded_by_user_id' });
            expect(fileForeignKeys[0]?.on_delete.toLowerCase()).toBe('cascade');
            const activityColumns = await db.all('PRAGMA table_info(activity_feed_item)') as { name: string }[];
            expect(activityColumns.map((column) => column.name)).toEqual([
                'id',
                'type',
                'actor_user_id',
                'subject_user_id',
                'target_type',
                'target_id',
                'data',
                'occurred_at',
                'created_at',
                'discussion_id',
            ]);
            const activityForeignKeys = await db.all('PRAGMA foreign_key_list(activity_feed_item)') as { table: string; from: string; on_delete: string }[];
            expect(activityForeignKeys).toHaveLength(3);
            expect(activityForeignKeys.filter((foreignKey) => foreignKey.table === 'user')
                .every((foreignKey) => foreignKey.on_delete.toLowerCase() === 'set null')).toBe(true);
            expect(activityForeignKeys.some((foreignKey) => foreignKey.table === 'discussion' && foreignKey.from === 'discussion_id')).toBe(true);
            db.run(`INSERT INTO activity_feed_item (id, type, target_type, target_id, data, occurred_at, created_at) VALUES ('crewnow-activity-1', 'crewnow.image_posted', 'crewnow.post', 'post-unique-target', '{}', 0, 0)`);
            expect(() => db.run(`INSERT INTO activity_feed_item (id, type, target_type, target_id, data, occurred_at, created_at) VALUES ('crewnow-activity-2', 'crewnow.image_posted', 'crewnow.post', 'post-unique-target', '{}', 0, 0)`)).toThrow();
            expect(() => db.run(`INSERT INTO activity_feed_item (id, type, data, occurred_at, target_type) VALUES ('invalid-target', 'crewnow.image_posted', '{}', 0, 'crewnow.post')`)).toThrow();

            const discussionMigration = readFileSync(`${import.meta.dir}/../../drizzle/0005_previous_ultragirl.sql`, 'utf8');
            expect(discussionMigration).toContain("SELECT lower(hex(randomblob(16))), 'crewnow.post'");
            expect(discussionMigration).toContain('UPDATE `crewnow_post`');
            expect(discussionMigration).toContain('UPDATE `activity_feed_item`');
            db.run(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('legacy-author', 'Legacy Author', 'legacy@example.test', 0, 0, 0)`);
            db.run(`INSERT INTO stored_file (id, storage_key, uploaded_by_user_id, mime_type, size, is_private, created_at, status) VALUES
                ('legacy-file-back', 'legacy-back.png', 'legacy-author', 'image/png', 10, 0, 0, 'ready'),
                ('legacy-file-front', 'legacy-front.png', 'legacy-author', 'image/png', 10, 0, 0, 'ready')`);
            db.run(`INSERT INTO crewnow_post (id, author_user_id, back_image_file_id, front_image_file_id, caption, created_at, updated_at)
                VALUES ('legacy-post', 'legacy-author', 'legacy-file-back', 'legacy-file-front', NULL, 123, 123)`);
            db.run(`INSERT INTO activity_feed_item (id, type, target_type, target_id, data, occurred_at, created_at)
                VALUES ('legacy-feed', 'crewnow.image_posted', 'crewnow.post', 'legacy-post', '{}', 123, 123)`);
            db.run(`UPDATE crewnow_post SET discussion_id = NULL WHERE id = 'legacy-post'`);
            db.run(`UPDATE activity_feed_item SET discussion_id = NULL WHERE id = 'legacy-feed'`);
            for (const statement of discussionMigration.split('--> statement-breakpoint')) {
                if (statement.trim()) db.run(statement);
            }
            const postDiscussionRows = await db.all(`SELECT discussion_id FROM crewnow_post WHERE id = 'legacy-post'`) as { discussion_id: string }[];
            const feedDiscussionRows = await db.all(`SELECT discussion_id FROM activity_feed_item WHERE id = 'legacy-feed'`) as { discussion_id: string }[];
            expect(postDiscussionRows[0]?.discussion_id).toBeTruthy();
            expect(feedDiscussionRows[0]?.discussion_id).toBe(postDiscussionRows[0]?.discussion_id);
            const matchingDiscussions = await db.all(`SELECT id FROM discussion WHERE target_type = 'crewnow.post' AND target_id = 'legacy-post'`);
            expect(matchingDiscussions).toHaveLength(1);
        } finally {
            connection.close();
        }
    });

});