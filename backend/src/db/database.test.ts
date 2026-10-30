import { describe, it } from 'bun:test';
import { createDatabase } from './connection';

describe('SQLite integration', () => {
    it('runs the production migrations', async () => {
        const connection = await createDatabase(':memory:');
        connection.close();
    });
});
