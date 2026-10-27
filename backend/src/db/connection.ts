import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
// @ts-ignore Bun provides the `bun:sqlite` module at runtime.
import { Database } from 'bun:sqlite';

// Bun provides `import.meta.dir`; declare it for frontend type-checkers that
// traverse this backend module but do not load Bun's ambient type definitions.
declare global {
    interface ImportMeta {
        readonly dir: string;
    }
}

export type DatabaseConnection = Awaited<ReturnType<typeof createDatabase>>;
export type AppDatabase = DatabaseConnection['db'];

/**
 * Opens a SQLite database, applies the production migrations, and returns its
 * Drizzle handle and close method. Tests can pass `:memory:` for isolation.
 */
export async function createDatabase(
    filename: string,
    migrationsFolder = `${import.meta.dir}/../../drizzle`,
) {
    const client = new Database(filename);
    client.run('PRAGMA foreign_keys = ON;');

    if (filename !== ':memory:') {
        client.run('PRAGMA journal_mode = WAL;');
    }

    try {
        const db = drizzle(client, { schema });
        await migrate(db, { migrationsFolder });

        return {
            db,
            close() {
                if (filename !== ':memory:') {
                    client.run('PRAGMA wal_checkpoint(TRUNCATE);');
                }
                client.close();
            },
        };
    } catch (error) {
        client.close();
        throw error;
    }
}