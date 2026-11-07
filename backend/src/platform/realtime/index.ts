import { Modules } from '$shared/constants';
import Elysia from 'elysia';
import type { createAuthMiddleware } from '../auth';
import { generateCentrifugoToken } from './service';
import type { User } from 'better-auth';
import { ok, type Result, type InternalError } from '../../lib/result';

export function createRealtimeModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    generateToken: (user: User) => Promise<Result<string, InternalError>> = generateCentrifugoToken,
) {
    // Keep the existing API URL for compatibility; this module owns realtime.
    return new Elysia({ prefix: '/gateway', name: Modules.REALTIME })
        .use(authMiddleware)
        .get('/token', async ({ user, status }) => {
            const result = await generateToken(user);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { token: result.value };
        }, { auth: true });
}