import { describe, expect, it } from 'bun:test';
import { warnIfUsingInMemoryDatabase } from './persistence-warning';

describe('in-memory database startup warning', () => {
    it('prints a prominent warning outside the test environment', () => {
        const warnings: string[] = [];

        warnIfUsingInMemoryDatabase(':memory:', 'production', (message) => warnings.push(message));

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('WARNING');
        expect(warnings[0]).toContain('DATA WILL BE LOST');
        expect(warnings[0]).toContain('GNAGHOME_DATABASE_URL');
    });

    it('does not warn when using an in-memory database in tests', () => {
        const warnings: string[] = [];

        warnIfUsingInMemoryDatabase(':memory:', 'test', (message) => warnings.push(message));

        expect(warnings).toHaveLength(0);
    });

    it('does not warn when using a file-backed database', () => {
        const warnings: string[] = [];

        warnIfUsingInMemoryDatabase('data/sqlite.db', 'production', (message) => warnings.push(message));

        expect(warnings).toHaveLength(0);
    });
});