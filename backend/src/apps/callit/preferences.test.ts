import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { createDatabase } from '../../db/connection';
import { createAuthMiddleware } from '../../platform/auth';
import { user } from '../../platform/users/schema';
import { createCallItModule } from './module';
import { CallItPreferencesService } from './preferences';

describe('CallItPreferencesService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let broadcast: ReturnType<typeof mock>;
    let service: CallItPreferencesService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
        broadcast = mock(async () => ({ ok: true as const, value: null }));
        service = new CallItPreferencesService(database.db, broadcast);
    });

    afterEach(() => database.close());

    it('defaults to the line chart without persisted settings', async () => {
        expect(await service.getPreferences('user-1')).toEqual({
            ok: true,
            value: { chartType: 'line' },
        });
    });

    it('persists the chart type for only the requested user and publishes a private change event', async () => {
        const saved = await service.updatePreferences('user-1', { chartType: 'candlestick' });

        expect(saved).toEqual({ ok: true, value: { chartType: 'candlestick' } });
        expect(await service.getPreferences('user-1')).toEqual({
            ok: true,
            value: { chartType: 'candlestick' },
        });
        expect(await service.getPreferences('user-2')).toEqual({
            ok: true,
            value: { chartType: 'line' },
        });
        expect(broadcast).toHaveBeenCalledWith(['user:user-1'], expect.objectContaining({
            type: 'callit.preferences.changed',
            occurredAt: expect.any(String),
            action: 'UPDATED',
            entityId: 'callit-preferences',
        }));
        expect(broadcast.mock.calls[0]?.[1]).not.toHaveProperty('data');
    });

    it('rejects unsupported chart types without changing the persisted preference', async () => {
        expect(await service.updatePreferences('user-1', { chartType: 'bars' } as never))
            .toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.getPreferences('user-1')).toEqual({
            ok: true,
            value: { chartType: 'line' },
        });
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('serves and updates preferences only for the authenticated user', async () => {
        let authenticated = true;
        const auth = createAuthMiddleware(
            async () => authenticated ? {
                user: {
                    id: 'user-1', createdAt: new Date(), updatedAt: new Date(), name: 'Alice',
                    email: 'alice@example.test', emailVerified: true, groups: '[]', image: null,
                },
                session: { id: 'session-1' },
            } : null,
            async () => new Response('auth'),
        );
        const app = new Elysia().use(createCallItModule(
            auth,
            {} as never,
            service,
            async () => {},
        ));

        const preferences = await app.handle(new Request('http://localhost/callit/preferences'));
        expect(preferences.status).toBe(200);
        expect(await preferences.json()).toEqual({ chartType: 'line' });

        const saved = await app.handle(new Request('http://localhost/callit/preferences', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chartType: 'candlestick' }),
        }));
        expect(saved.status).toBe(200);
        expect(await saved.json()).toEqual({ chartType: 'candlestick' });

        const invalid = await app.handle(new Request('http://localhost/callit/preferences', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chartType: 'bars' }),
        }));
        expect(invalid.status).toBe(422);

        authenticated = false;
        const unauthorized = await app.handle(new Request('http://localhost/callit/preferences'));
        expect(unauthorized.status).toBe(401);
    });
});
