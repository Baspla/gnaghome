import { describe, expect, it } from 'bun:test';
import { fetchCurrentUserAdminStatus } from '../../../frontend/src/lib/server/admin-status';

describe('fetchCurrentUserAdminStatus', () => {
    it('forwards the session cookie and accepts admin status for the current user', async () => {
        const isAdmin = await fetchCurrentUserAdminStatus(
            async (input, init) => {
                expect(String(input)).toBe('http://backend/api/v1/users/me');
                expect(new Headers(init?.headers).get('cookie')).toBe('session=secret-cookie');
                return Response.json({ id: 'user-1', isAdmin: true });
            },
            'http://backend/api',
            'session=secret-cookie',
            'user-1',
        );

        expect(isAdmin).toBe(true);
    });

    it('does not accept admin status for a different user or non-admin response', async () => {
        const mismatchedUser = await fetchCurrentUserAdminStatus(
            async () => Response.json({ id: 'user-2', isAdmin: true }),
            'http://backend/api',
            'session=secret-cookie',
            'user-1',
        );
        const regularUser = await fetchCurrentUserAdminStatus(
            async () => Response.json({ id: 'user-1', isAdmin: false }),
            'http://backend/api',
            'session=secret-cookie',
            'user-1',
        );

        expect(mismatchedUser).toBe(false);
        expect(regularUser).toBe(false);
    });

    it('fails closed when the profile endpoint is unavailable or malformed', async () => {
        const unavailable = await fetchCurrentUserAdminStatus(
            async () => new Response(null, { status: 503 }),
            'http://backend/api',
            'session=secret-cookie',
            'user-1',
        );
        const malformed = await fetchCurrentUserAdminStatus(
            async () => Response.json({ id: 'user-1', isAdmin: 'true' }),
            'http://backend/api',
            'session=secret-cookie',
            'user-1',
        );

        expect(unavailable).toBe(false);
        expect(malformed).toBe(false);
    });
});