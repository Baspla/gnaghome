import type { AppDatabase } from './db/connection';
import { UserService } from './platform/users/service';
import { ActivityFeedService } from './platform/activity-feed';
import { FilesService, LocalFileStorage } from './platform/files';
import type { BroadcastPublisher } from './platform/realtime/service';

export function createServices(db: AppDatabase, broadcast: BroadcastPublisher, filesDirectory = 'data/files') {
    const users = new UserService(db);
    const activityFeed = new ActivityFeedService(db, broadcast);
    const files = new FilesService(db, new LocalFileStorage(filesDirectory));

    return { users, activityFeed, files };
}