import { Modules } from '$shared/constants';
import Elysia, { t } from 'elysia';
import type { createAuthMiddleware } from '../auth';
import { generateCentrifugoToken } from './service';
import type { User } from 'better-auth';
import { ok, type Result, type InternalError } from '../../lib/result';

export function createRealtimeModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    generateToken: (user: User, deviceId: string) => Promise<Result<string, InternalError>> = generateCentrifugoToken,
) {
    // Keep the existing API URL for compatibility; this module owns realtime.
    return new Elysia({ prefix: '/gateway', name: Modules.REALTIME })
        .use(authMiddleware)
        .get('/token', async ({ query, user, status }) => {
            const result = await generateToken(user, query.deviceId);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return { token: result.value };
        }, {
            query: t.Object({ deviceId: t.String() }),
            auth: true,
        });
}