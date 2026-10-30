import { describe, expect, it } from 'bun:test';
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
            ]);
            const activityForeignKeys = await db.all('PRAGMA foreign_key_list(activity_feed_item)') as { table: string; from: string; on_delete: string }[];
            expect(activityForeignKeys).toHaveLength(2);
            expect(activityForeignKeys.every((foreignKey) => foreignKey.table === 'user' && foreignKey.on_delete.toLowerCase() === 'set null')).toBe(true);
            db.run(`INSERT INTO activity_feed_item (id, type, target_type, target_id, data, occurred_at, created_at) VALUES ('crewnow-activity-1', 'crewnow.image_posted', 'crewnow.post', 'post-unique-target', '{}', 0, 0)`);
            expect(() => db.run(`INSERT INTO activity_feed_item (id, type, target_type, target_id, data, occurred_at, created_at) VALUES ('crewnow-activity-2', 'crewnow.image_posted', 'crewnow.post', 'post-unique-target', '{}', 0, 0)`)).toThrow();
            expect(() => db.run(`INSERT INTO activity_feed_item (id, type, data, occurred_at, target_type) VALUES ('invalid-target', 'crewnow.image_posted', '{}', 0, 'crewnow.post')`)).toThrow();
        } finally {
            connection.close();
        }
    });

});