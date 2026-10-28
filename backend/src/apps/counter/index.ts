import { Modules } from '$shared/constants';
import { Elysia } from 'elysia';
import type { createAuthMiddleware } from '../../platform/auth';
import type { CounterService } from './service';

type CounterServiceDependency = Pick<CounterService, 'getCounts' | 'increment'>;

export function createCounterModule(
    authMiddleware: ReturnType<typeof createAuthMiddleware>,
    counterService: CounterServiceDependency,
) {
    return new Elysia({ prefix: '/counter', name: Modules.COUNTER })
        .use(authMiddleware)
        .get('/', async ({ user, status }) => {
            const result = await counterService.getCounts(user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return result.value;
        }, { auth: true })
        .post('/increment', async ({ user, status }) => {
            const result = await counterService.increment(user.id);
            if (!result.ok) return status(result.error.status, { error: result.error });
            return result.value;
        }, { auth: true });
}