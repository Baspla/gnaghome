import type { AppDatabase } from './db/connection';
import { UserService } from './platform/users/service';
import { ActivityFeedService } from './platform/activity-feed';
import { FilesService, LocalFileStorage } from './platform/files';
import type { BroadcastPublisher } from './platform/realtime/service';
import { CrewNowService } from './apps/crewnow/service';
import { DiscussionsService } from './platform/discussions/service';

export function createServices(db: AppDatabase, broadcast: BroadcastPublisher, filesDirectory = 'data/files') {
    const users = new UserService(db);
    const activityFeed = new ActivityFeedService(db, broadcast);
    const discussions = new DiscussionsService(db, broadcast);
    const files = new FilesService(db, new LocalFileStorage(filesDirectory));
    const crewnow = new CrewNowService(db, files, activityFeed, discussions);

    return { users, activityFeed, discussions, files, crewnow };
}