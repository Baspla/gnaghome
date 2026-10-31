import type { NotificationTopicInput } from '../../platform/notifications/service';

export const CREWNOW_NOTIFICATION_TOPICS: NotificationTopicInput[] = [
    {
        id: 'crewnow.post.new',
        appId: 'crewnow',
        label: 'Neue CrewNows',
        description: 'Wenn jemand einen CrewNow postet, in dem du nicht markiert bist.',
    },
    {
        id: 'crewnow.post.tagged',
        appId: 'crewnow',
        label: 'CrewNows, in denen ich markiert bin',
        description: 'Wenn du auf einem neuen CrewNow markiert wirst.',
    },
    {
        id: 'crewnow.daily-reminder',
        appId: 'crewnow',
        label: 'Tägliche Erinnerung zum Posten',
        description: 'Ein zufälliger Hinweis zwischen 09:00 und 20:00 Uhr, falls du heute noch nichts gepostet hast.',
    },
];