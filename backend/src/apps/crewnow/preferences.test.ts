import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { user } from '../../platform/users/schema';
import { CrewNowPreferencesService } from './preferences';
import { createAuthMiddleware } from '../../platform/auth';
import { Elysia } from 'elysia';
import { createCrewNowModule } from './module';

describe('CrewNowPreferencesService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let broadcast: ReturnType<typeof mock>;
    let service: CrewNowPreferencesService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        await database.db.insert(user).values([
            { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
            { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
        ]);
        broadcast = mock(async () => ({ ok: true as const, value: null }));
        service = new CrewNowPreferencesService(database.db, broadcast);
    });

    afterEach(() => database.close());

    it('defaults to mirrored preview and one second without persisted settings', async () => {
        expect(await service.getPreferences('user-1')).toEqual({
            ok: true,
            value: { mirrorFrontPreview: true, captureDelaySeconds: 1 },
        });
    });

    it('persists preferences for only the requested user and publishes an invalidation', async () => {
        const saved = await service.updatePreferences('user-1', {
            mirrorFrontPreview: false,
            captureDelaySeconds: 3,
        });

        expect(saved.ok).toBe(true);
        if (saved.ok) expect(saved.value).toEqual({ mirrorFrontPreview: false, captureDelaySeconds: 3 });
        expect(await service.getPreferences('user-1')).toEqual({
            ok: true,
            value: { mirrorFrontPreview: false, captureDelaySeconds: 3 },
        });
        expect(await service.getPreferences('user-2')).toEqual({
            ok: true,
            value: { mirrorFrontPreview: true, captureDelaySeconds: 1 },
        });
        expect(broadcast).toHaveBeenCalledWith(['user:user-1'], expect.objectContaining({
            type: 'crewnow.preferences.changed',
            data: {},
        }));
    });

    it('rejects unsupported delays without changing the persisted preferences', async () => {
        expect(await service.updatePreferences('user-1', {
            mirrorFrontPreview: false,
            captureDelaySeconds: 4,
        })).toMatchObject({ ok: false, error: { status: 400 } });
        expect(await service.getPreferences('user-1')).toMatchObject({
            ok: true,
            value: { mirrorFrontPreview: true, captureDelaySeconds: 1 },
        });
        expect(broadcast).not.toHaveBeenCalled();
    });

    it('accepts exactly the supported capture delays', async () => {
        for (const captureDelaySeconds of [1, 2, 3, 5] as const) {
            expect(await service.updatePreferences('user-1', {
                mirrorFrontPreview: true,
                captureDelaySeconds,
            })).toMatchObject({ ok: true, value: { captureDelaySeconds } });
        }
        expect(await service.updatePreferences('user-1', {
            mirrorFrontPreview: true,
            captureDelaySeconds: 0,
        })).toMatchObject({ ok: false, error: { status: 400 } });
    });

    it('serves and updates settings only for the authenticated user and validates delay choices', async () => {
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
        const app = new Elysia().use(createCrewNowModule(auth, {} as never, service));

        const settings = await app.handle(new Request('http://localhost/crewnow/preferences'));
        expect(settings.status).toBe(200);
        expect(await settings.json()).toEqual({ mirrorFrontPreview: true, captureDelaySeconds: 1 });

        const saved = await app.handle(new Request('http://localhost/crewnow/preferences', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mirrorFrontPreview: false, captureDelaySeconds: 5 }),
        }));
        expect(saved.status).toBe(200);
        expect(await saved.json()).toEqual({ mirrorFrontPreview: false, captureDelaySeconds: 5 });

        const invalid = await app.handle(new Request('http://localhost/crewnow/preferences', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mirrorFrontPreview: true, captureDelaySeconds: 4 }),
        }));
        expect(invalid.status).toBe(422);

        authenticated = false;
        const unauthorized = await app.handle(new Request('http://localhost/crewnow/preferences'));
        expect(unauthorized.status).toBe(401);
    });
});