import { describe, expect, it } from 'bun:test';
import { createDatabase } from './connection';
import { activityFeedItem } from '../platform/activity-feed/schema';

describe('SQLite integration', () => {
    it('applies production migrations without retaining removed counter data', async () => {
        const connection = await createDatabase(':memory:');
        try {
            const { db } = connection;
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = \'table\'') as { name: string }[];
            expect(tables.map((table) => table.name)).toContain('user');
            expect(tables.map((table) => table.name)).not.toContain('counter');
            expect(tables.map((table) => table.name)).toContain('activity_feed_item');
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

    it('removes legacy counter milestones while preserving unrelated feed activities', async () => {
        const connection = await createDatabase(':memory:');
        try {
            connection.db.run('CREATE TABLE `counter` (`id` text PRIMARY KEY NOT NULL, `count` integer NOT NULL DEFAULT 0)');
            connection.db.run("INSERT INTO `counter` (`id`, `count`) VALUES ('global:counter', 100)");
            await connection.db.insert(activityFeedItem).values([
                {
                    id: 'legacy-counter-milestone',
                    type: 'counter.milestone',
                    data: JSON.stringify({ totalCount: 100 }),
                    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
                },
                {
                    id: 'existing-profile-activity',
                    type: 'profile.updated',
                    data: JSON.stringify({ changedFields: ['name'] }),
                    occurredAt: new Date('2026-01-02T00:00:00.000Z'),
                },
            ]);

            const migration = await Bun.file(new URL('../../drizzle/0002_steady_human_robot.sql', import.meta.url)).text();
            for (const statement of migration.split('--> statement-breakpoint')) {
                if (statement.trim()) connection.db.run(statement.trim());
            }

            const remainingActivities = await connection.db.select({ id: activityFeedItem.id })
                .from(activityFeedItem)
                .all();
            expect(remainingActivities).toEqual([{ id: 'existing-profile-activity' }]);
            const counterTables = await connection.db.all(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'counter'",
            );
            expect(counterTables).toHaveLength(0);
        } finally {
            connection.close();
        }
    });
});