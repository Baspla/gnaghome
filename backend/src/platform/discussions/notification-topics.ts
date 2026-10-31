import type { NotificationTopicInput } from '../notifications/service';

export const DISCUSSION_NOTIFICATION_TOPICS: NotificationTopicInput[] = [
    {
        id: 'discussions.post-comment',
        appId: 'discussions',
        label: 'Kommentar zu meinem CrewNow',
        description: 'Wenn jemand einen deiner CrewNow kommentiert.',
    },
    {
        id: 'discussions.new-message',
        appId: 'discussions',
        label: 'Neue Nachricht in einer Diskussion',
        description: 'Wenn in einer Diskussion, in der du geschrieben hast, eine neue Nachricht erscheint.',
    },
];