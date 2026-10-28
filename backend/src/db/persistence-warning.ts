const IN_MEMORY_DATABASE_WARNING = `
╔═══════════════════════════════════════════════════════════════════════╗
║  ⚠️  WARNING: DATABASE IS RUNNING IN MEMORY — DATA WILL BE LOST  ⚠️  ║
║                                                                       ║
║  This database is temporary. All data disappears when the backend     ║
║  stops or restarts. Set GNAGHOME_DATABASE_URL to a persistent file    ║
║  path (for example: data/sqlite.db) to keep your data.                ║
╚═══════════════════════════════════════════════════════════════════════╝`;

export function warnIfUsingInMemoryDatabase(
    databaseUrl: string,
    nodeEnvironment: string | undefined,
    warn: (message: string) => void = console.warn,
): void {
    if (databaseUrl === ':memory:' && nodeEnvironment !== 'test') {
        warn(IN_MEMORY_DATABASE_WARNING);
    }
}