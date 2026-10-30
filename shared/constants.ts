export const Modules = {
    USER: 'user',
    AUTH: 'auth',
    REALTIME: 'realtime',
    ACTIVITY_FEED: 'activity-feed',
    DISCUSSIONS: 'discussions',
    FILES: 'files',
} as const;

export const RealtimeChannels = {
    ACTIVITY_FEED: 'public:activity-feed',
    DISCUSSIONS: 'public:discussions',
} as const;

export type ModuleId = typeof Modules[keyof typeof Modules]; 

export const NotificationTypes = {
    GROUP_INVITE: 'GROUP_INVITE',
    POST_MENTION: 'POST_MENTION',
    SYSTEM_ALERT: 'SYSTEM_ALERT',
} as const;

export type NotificationType = typeof NotificationTypes[keyof typeof NotificationTypes];