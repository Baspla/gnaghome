import { describe, expect, it } from 'bun:test';
import { createDatabase } from './connection';

describe('SQLite integration', () => {
    it('applies production migrations and retains legacy tables without dropping user data', async () => {
        const connection = await createDatabase(':memory:');
        try {
            const { db } = connection;
            const tables = await db.all('SELECT name FROM sqlite_master WHERE type = \'table\'') as { name: string }[];
            expect(tables.map((table) => table.name)).toContain('message');
            expect(tables.map((table) => table.name)).toContain('channel_metadata');
            expect(tables.map((table) => table.name)).toContain('role');
            expect(tables.map((table) => table.name)).toContain('counter');
            const counterColumns = await db.all('PRAGMA table_info(counter)') as { name: string }[];
            expect(counterColumns.map((column) => column.name)).toEqual(['id', 'count']);
        } finally {
            connection.close();
        }
    });
});