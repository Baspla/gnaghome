import { CREWNOW_NOTIFICATION_TOPICS } from '../../apps/crewnow/notification-topics';
import { CALL_IT_NOTIFICATION_TOPICS } from '../../apps/callit/notification-topics';
import { DISCUSSION_NOTIFICATION_TOPICS } from '../discussions/notification-topics';

export const NOTIFICATION_TOPICS = [
    ...CREWNOW_NOTIFICATION_TOPICS,
    ...CALL_IT_NOTIFICATION_TOPICS,
    ...DISCUSSION_NOTIFICATION_TOPICS,
] as const;