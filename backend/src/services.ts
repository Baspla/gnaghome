import type { AppDatabase } from './db/connection';
import { UserService } from './platform/users/service';
import { ActivityFeedService } from './platform/activity-feed';
import { FilesService, LocalFileStorage } from './platform/files';
import type { BroadcastPublisher } from './platform/realtime/service';
import { CrewNowService } from './apps/crewnow/service';
import { CrewNowPreferencesService } from './apps/crewnow/preferences';
import { DiscussionsService } from './platform/discussions/service';
import { TasksService } from './platform/tasks';
import { NotificationsService } from './platform/notifications/service';
import { createWebPushSender, type VapidConfig } from './platform/notifications/push';
import { CustomEmojiService } from './platform/custom-emoji/service';
import { ReactionsService } from './platform/reactions/service';

export function createServices(
    db: AppDatabase,
    broadcast: BroadcastPublisher,
    filesDirectory = 'data/files',
    vapid: VapidConfig = {},
) {
    const users = new UserService(db, broadcast);
    const activityFeed = new ActivityFeedService(db, broadcast);
    const notifications = new NotificationsService(db, createWebPushSender(vapid), undefined, broadcast);
    const discussions = new DiscussionsService(db, broadcast, notifications);
    const tasks = new TasksService(db);
    const files = new FilesService(db, new LocalFileStorage(filesDirectory));
    const customEmoji = new CustomEmojiService(db, files, broadcast);
    let crewnow!: CrewNowService;
    const reactions = new ReactionsService(
        db,
        broadcast,
        undefined,
        (name) => customEmoji.hasEmoji(name),
        async (target, actorUserId) => {
            if (target.targetType !== 'crewnow.post') return;
            const ownerUserId = await crewnow.getPostOwnerUserId(target.targetId);
            if (!ownerUserId || ownerUserId === actorUserId) return;
            await notifications.notifyUsers('crewnow.post.reaction', [ownerUserId], {
                title: 'Neue Reaktion auf deinen CrewNow',
                body: 'Jemand hat auf deinen CrewNow reagiert.',
                url: `/crewnow/posts/${encodeURIComponent(target.targetId)}`,
            });
        },
    );
    crewnow = new CrewNowService(db, files, activityFeed, discussions, notifications, broadcast, reactions);
    const crewnowPreferences = new CrewNowPreferencesService(db, broadcast);
    discussions.setTargetOwnerResolver(async (targetType, targetId) =>
        targetType === 'crewnow.post' ? crewnow.getPostOwnerUserId(targetId) : null);

    return { users, activityFeed, discussions, reactions, files, customEmoji, crewnow, crewnowPreferences, tasks, notifications };
}