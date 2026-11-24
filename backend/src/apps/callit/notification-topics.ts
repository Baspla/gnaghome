import type { NotificationTopicInput } from '../../platform/notifications/service';

export const CALL_IT_NOTIFICATION_TOPICS: NotificationTopicInput[] = [
    {
        id: 'callit.prediction.new',
        appId: 'callit',
        label: 'Neue Vorhersagen',
        description: 'Wenn jemand anderes eine Vorhersage platziert.',
    },
    {
        id: 'callit.prediction.completed',
        appId: 'callit',
        label: 'Abgeschlossene Vorhersagen anderer',
        description: 'Wenn die Vorhersage einer anderen Person abgeschlossen wird.',
    },
    {
        id: 'callit.prediction.mine-completed',
        appId: 'callit',
        label: 'Meine abgeschlossenen Vorhersagen',
        description: 'Wenn eine deiner Vorhersagen abgeschlossen wird.',
    },
];
