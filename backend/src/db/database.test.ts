import { describe, expect, it } from 'bun:test';
import { createDatabase } from './connection';

describe('SQLite integration', () => {
    it('applies production migrations without dropping user data', async () => {
        const connection = await createDatabase(':memory:');
        try {
            const { db } = connection;
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = \'table\'') as { name: string }[];
            expect(tables.map((table) => table.name)).toContain('user');
            expect(tables.map((table) => table.name)).toContain('counter');
            expect(tables.map((table) => table.name)).toContain('activity_feed_item');
            const counterColumns = await db.all('PRAGMA table_info(counter)') as { name: string }[];
            expect(counterColumns.map((column) => column.name)).toEqual(['id', 'count']);
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
            expect(() => db.run(`INSERT INTO activity_feed_item (id, type, data, occurred_at, target_type) VALUES ('invalid-target', 'crewnow.image_posted', '{}', 0, 'crewnow.post')`)).toThrow();
        } finally {
            connection.close();
        }
    });
});