import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { cookie } from '@elysiajs/cookie';
import { createAuthMiddleware, type SessionResolver } from './platform/auth';
import { createUserModule } from './platform/users';
import { createLogger } from './lib/logger';
import { createRealtimeModule } from './platform/realtime';
import { createActivityFeedModule } from './platform/activity-feed/module';
import { createFilesModule } from './platform/files/module';

const logger = createLogger('app');

type UserServiceDependency = Pick<import('./platform/users/service').UserService, 'getUserAsUser'>;
type ActivityFeedServiceDependency = Pick<import('./platform/activity-feed/service').ActivityFeedService, 'getFeed'>;
type FilesServiceDependency = Pick<import('./platform/files/service').FilesService, 'uploadFile' | 'getFile'>;

export type AppDependencies = {
    getSession: SessionResolver;
    authHandler: (request: Request) => Response | Promise<Response>;
    adminGroupName?: string;
    userService: UserServiceDependency;
    activityFeedService: ActivityFeedServiceDependency;
    filesService: FilesServiceDependency;
    realtimeModule: typeof createRealtimeModule;
    generateRealtimeToken: (user: import('better-auth').User, deviceId: string) => Promise<import('./lib/result').Result<string, import('./lib/result').InternalError>>;
};

export type AppServices = Pick<AppDependencies, 'userService'>;

export function createApp(dependencies: AppDependencies) {
    const authMiddleware = createAuthMiddleware(
        dependencies.getSession,
        dependencies.authHandler,
        dependencies.adminGroupName,
    );

    return new Elysia()
        .onRequest(({ request }) => {
            if (
                request.url.includes('/api/betterauth/auth/get-session') ||
                // Retain the old gateway URL while the module is now platform/realtime.
                request.url.includes('/api/v1/gateway/token')
            ) return;
            logger.debug('request', { method: request.method, url: request.url });
        })
        .onError(({ code, error, set }) => {
            if (code === 'NOT_FOUND') {
                set.status = 404;
                return { error: { code: 'NOT_FOUND', message: 'Not found' } };
            }
            if (code === 'VALIDATION') {
                set.status = 400;
                return { error: { code: 'VALIDATION', message: 'Validation failed', details: error } };
            }

            logger.error('unhandled error', { message: String(error) });
            set.status = 500;
            return { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } };
        })
        .use(cors())
        .use(cookie())
        .use(authMiddleware)
        .group('/api', (api) =>
            api
                .get('/', () => ({ versions: ['v1'] }))
                .group('/v1', (v1) =>
                    v1
                        .get('/', () => ({ message: 'API v1' }))
                        .get('/health', () => ({ status: 'ok' }))
                        .get('/status', () => ({ status: 'online' }))
                        .use(createUserModule(authMiddleware, dependencies.userService))
                        .use(createActivityFeedModule(authMiddleware, dependencies.activityFeedService, dependencies.userService))
                        .use(createFilesModule(authMiddleware, dependencies.filesService))
                        .use(dependencies.realtimeModule(authMiddleware, dependencies.generateRealtimeToken))
                )
        );
}

export type App = ReturnType<typeof createApp>;