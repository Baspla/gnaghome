import { createApp } from './app';
import { createDatabase } from './db/connection';
import { createServices } from './services';
import { createRealtimeModule } from './platform/realtime';
import { createAuth } from './platform/auth/service';
import { generateCentrifugoToken } from './platform/realtime/service';
import { createLogger } from './lib/logger';
import { env } from './env';

const logger = createLogger('app');
const database = await createDatabase(env.DATABASE_URL, `${import.meta.dir}/../drizzle`);
const services = createServices(database.db);
const { users: userService } = services;
const auth = createAuth(database.db, userService);

const app = createApp({
    getSession: (headers) => auth.api.getSession({ headers }),
    authHandler: (request) => auth.handler(request),
    adminGroupName: env.ADMIN_GROUP_NAME,
    userService,
    realtimeModule: createRealtimeModule,
    generateRealtimeToken: generateCentrifugoToken,
}).listen(3000);
logger.info('backend running', { port: app.server?.port });

let shuttingDown = false;
const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown signal received', { signal });
    database.close();
    process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));