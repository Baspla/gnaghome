import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Elysia } from 'elysia';
import { createApp, type AppDependencies } from './app';
import { ok } from './lib/result';
import { createAuthMiddleware } from './platform/auth';
import { createRealtimeModule } from './platform/realtime';

const sessionUser = {
    id: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    name: 'Test User',
    email: 'user@example.test',
    emailVerified: true,
    groups: '[]',
    image: null,
};

let session: Awaited<ReturnType<AppDependencies['getSession']>> = null;
const getUserAsUser = mock(async () => ok({ id: 'user-1', name: 'Test User', image: null }));
const getCounterCounts = mock(async (_userId: string) => ok({ userCount: 2, totalCount: 7 }));
const incrementCounter = mock(async (_userId: string) => ok({ userCount: 3, totalCount: 8 }));

function makeTestApp() {
    return createApp({
        getSession: async () => session,
        authHandler: async () => new Response('test auth handler'),
        adminGroupName: 'admins',
        userService: { getUserAsUser },
        counterService: { getCounts: getCounterCounts, increment: incrementCounter },
        realtimeModule: createRealtimeModule,
        generateRealtimeToken: async () => ok('test-token'),
    });
}

describe('backend HTTP app', () => {
    beforeEach(() => {
        session = null;
        getUserAsUser.mockClear();
        getCounterCounts.mockClear();
        incrementCounter.mockClear();
    });

    it('builds an in-process app from injected test dependencies', () => {
        expect(() => makeTestApp()).not.toThrow();
    });

    it('serves health checks without requiring a session', async () => {
        const response = await makeTestApp().handle(new Request('http://localhost/api/v1/health'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('does not register chat or LiveKit API routes', async () => {
        session = { user: sessionUser, session: { id: 'session-1' } };

        const chatResponse = await makeTestApp().handle(new Request('http://localhost/api/v1/chat/channels'));
        const livekitResponse = await makeTestApp().handle(new Request(
            'http://localhost/api/v1/livekit/token?deviceId=device-1&roomName=room-1',
        ));

        expect(chatResponse.status).toBe(404);
        expect(livekitResponse.status).toBe(404);
    });

    it('retains authenticated Centrifugo token issuance', async () => {
        session = { user: sessionUser, session: { id: 'session-1' } };
        const response = await makeTestApp().handle(new Request(
            'http://localhost/api/v1/gateway/token?deviceId=default',
        ));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ token: 'test-token' });
    });

    it('rejects an unauthenticated request to a protected route', async () => {
        const response = await makeTestApp().handle(new Request('http://localhost/api/v1/users/me'));
        expect(response.status).toBe(401);
        expect(getUserAsUser).not.toHaveBeenCalled();
    });

    it('requires authentication to read and increment the counter', async () => {
        const app = makeTestApp();
        const readResponse = await app.handle(new Request('http://localhost/api/v1/counter'));
        const incrementResponse = await app.handle(new Request('http://localhost/api/v1/counter/increment', { method: 'POST' }));

        expect(readResponse.status).toBe(401);
        expect(incrementResponse.status).toBe(401);
        expect(getCounterCounts).not.toHaveBeenCalled();
        expect(incrementCounter).not.toHaveBeenCalled();
    });

    it('returns the authenticated user’s counts and increments only that user', async () => {
        session = { user: sessionUser, session: { id: 'session-1' } };
        const app = makeTestApp();

        const readResponse = await app.handle(new Request('http://localhost/api/v1/counter'));
        const incrementResponse = await app.handle(new Request('http://localhost/api/v1/counter/increment', { method: 'POST' }));

        expect(readResponse.status).toBe(200);
        expect(await readResponse.json()).toEqual({ userCount: 2, totalCount: 7 });
        expect(incrementResponse.status).toBe(200);
        expect(await incrementResponse.json()).toEqual({ userCount: 3, totalCount: 8 });
        expect(getCounterCounts).toHaveBeenCalledWith('user-1');
        expect(incrementCounter).toHaveBeenCalledWith('user-1');
    });

    it('passes the authenticated user to the user service', async () => {
        session = { user: sessionUser, session: { id: 'session-1' } };
        const response = await makeTestApp().handle(new Request('http://localhost/api/v1/users/me'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: 'user-1',
            name: 'Test User',
            email: 'user@example.test',
            emailVerified: true,
            image: null,
            isAdmin: false,
        });
        expect(getUserAsUser).toHaveBeenCalledWith('user-1', 'user-1');
    });

    it('includes computed admin status in the current-user response', async () => {
        session = { user: { ...sessionUser, groups: '["admins"]' }, session: { id: 'session-1' } };
        const response = await makeTestApp().handle(new Request('http://localhost/api/v1/users/me'));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            id: 'user-1',
            name: 'Test User',
            email: 'user@example.test',
            emailVerified: true,
            image: null,
            isAdmin: true,
        });
    });

    it('does not expose stored OIDC groups when loading the signed-in user by id', async () => {
        session = { user: { ...sessionUser, groups: '["admins"]' }, session: { id: 'session-1' } };
        const response = await makeTestApp().handle(new Request('http://localhost/api/v1/users/user-1'));

        expect(response.status).toBe(200);
        const profile = await response.json();
        expect(profile).toMatchObject({ id: 'user-1', isAdmin: true });
        expect(profile).not.toHaveProperty('groups');
    });

});

describe('auth middleware', () => {
    it('provides computed admin status on the authenticated user', async () => {
        const app = new Elysia()
            .use(createAuthMiddleware(
                async () => ({ user: { ...sessionUser, groups: '["admins"]' }, session: { id: 'session-1' } }),
                async () => new Response('auth handler'),
                'admins',
            ))
            .get('/whoami', ({ user }) => ({ id: user.id, isAdmin: user.isAdmin }), { auth: true });

        const response = await app.handle(new Request('http://localhost/whoami'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ id: 'user-1', isAdmin: true });
    });

    it('marks malformed group data as non-admin', async () => {
        const app = new Elysia()
            .use(createAuthMiddleware(
                async () => ({ user: { ...sessionUser, groups: '{invalid' }, session: { id: 'session-1' } }),
                async () => new Response('auth handler'),
                'admins',
            ))
            .get('/whoami', ({ user }) => ({ isAdmin: user.isAdmin }), { auth: true });

        const response = await app.handle(new Request('http://localhost/whoami'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ isAdmin: false });
    });

    it('does not grant admin when no admin group is configured', async () => {
        const app = new Elysia()
            .use(createAuthMiddleware(
                async () => ({ user: { ...sessionUser, groups: '["admins"]' }, session: { id: 'session-1' } }),
                async () => new Response('auth handler'),
            ))
            .get('/whoami', ({ user }) => ({ isAdmin: user.isAdmin }), { auth: true });

        const response = await app.handle(new Request('http://localhost/whoami'));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ isAdmin: false });
    });
});