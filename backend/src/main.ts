import { createApp } from './app';
import { createDatabase } from './db/connection';
import { createServices } from './services';
import { createRealtimeModule } from './platform/realtime';
import { createAuth } from './platform/auth/service';
import {
    createBroadcastPublisher,
    createCentrifugoPublisher,
    generateCentrifugoToken,
} from './platform/realtime/service';
import { createLogger } from './lib/logger';
import { env } from './env';
import { warnIfUsingInMemoryDatabase } from './db/persistence-warning';

const logger = createLogger('app');
warnIfUsingInMemoryDatabase(env.DATABASE_URL, process.env.NODE_ENV);
const database = await createDatabase(env.DATABASE_URL, `${import.meta.dir}/../drizzle`);
const broadcast = createBroadcastPublisher(
    createCentrifugoPublisher(env.CENTRIFUGO_URL, env.CENTRIFUGO_API_KEY),
);
const services = createServices(database.db, broadcast, env.FILES_DIRECTORY);
const {
    users: userService,
    activityFeed: activityFeedService,
    discussions: discussionsService,
    files: filesService,
    crewnow: crewNowService,
} = services;
const initialFileCleanup = filesService.cleanupExpiredUploads();
void initialFileCleanup.then((result) => {
    if (result.ok) {
        logger.info('expired file upload cleanup finished', { deletedFiles: result.value });
    } else {
        logger.warn('expired file upload cleanup failed; hourly retry is scheduled', { error: result.error.message });
    }
});
const fileCleanupTimer = setInterval(() => {
    void filesService.cleanupExpiredUploads();
}, 60 * 60 * 1000);
fileCleanupTimer.unref();
const auth = createAuth(database.db, userService);

const app = createApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    authHandler: (request) => auth.handler(request),
    adminGroupName: env.ADMIN_GROUP_NAME,
    userService,
    activityFeedService,
    discussionsService,
    discussionsFeedService: discussionsService,
    canViewDiscussionTarget: async (viewerUserId, targetType, targetId) => {
        if (targetType !== 'crewnow.post') return false;
        return (await crewNowService.getPostForActivity(viewerUserId, targetId)).ok;
    },
    filesService,
    crewNowService,
    realtimeModule: createRealtimeModule,
    generateRealtimeToken: generateCentrifugoToken,
}).listen(3000);
logger.info('backend running', { port: app.server?.port });

let shuttingDown = false;
const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown signal received', { signal });
    clearInterval(fileCleanupTimer);
    database.close();
    process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));