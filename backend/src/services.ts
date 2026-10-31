import type { AppDatabase } from './db/connection';
import { UserService } from './platform/users/service';
import { ActivityFeedService } from './platform/activity-feed';
import { FilesService, LocalFileStorage } from './platform/files';
import type { BroadcastPublisher } from './platform/realtime/service';
import { CrewNowService } from './apps/crewnow/service';
import { DiscussionsService } from './platform/discussions/service';
import { TasksService } from './platform/tasks';
import { NotificationsService } from './platform/notifications/service';
import { createWebPushSender, type VapidConfig } from './platform/notifications/push';

export function createServices(
    db: AppDatabase,
    broadcast: BroadcastPublisher,
    filesDirectory = 'data/files',
    vapid: VapidConfig = {},
) {
    const users = new UserService(db);
    const activityFeed = new ActivityFeedService(db, broadcast);
    const notifications = new NotificationsService(db, createWebPushSender(vapid), undefined, broadcast);
    const discussions = new DiscussionsService(db, broadcast, notifications);
    const tasks = new TasksService(db);
    const files = new FilesService(db, new LocalFileStorage(filesDirectory));
    const crewnow = new CrewNowService(db, files, activityFeed, discussions, notifications);
    discussions.setTargetOwnerResolver(async (targetType, targetId) =>
        targetType === 'crewnow.post' ? crewnow.getPostOwnerUserId(targetId) : null);

    return { users, activityFeed, discussions, files, crewnow, tasks, notifications };
}