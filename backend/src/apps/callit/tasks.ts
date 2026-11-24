import type { TasksService } from '../../platform/tasks/service';
import { CALL_IT_UPDATE_INTERVALS, type CallItService, type CallItUpdateInterval } from './service';

declare module '../../platform/tasks/service' {
    interface TaskPayloadMap {
        'callit.sync': Record<string, never>;
    }
}

export const CALL_IT_SYNC_TASK = 'callit.sync';
export const CALL_IT_SYNC_SCHEDULE_KEY = 'callit.price-sync';

export function cronForInterval(minutes: CallItUpdateInterval): string {
    if (minutes === 60) return '0 * * * *';
    return `*/${minutes} * * * *`;
}

export function registerCallItTasks(tasks: TasksService, service: CallItService): void {
    tasks.registerWorker(CALL_IT_SYNC_TASK, async () => {
        const result = await service.syncPrices();
        if (!result.ok) throw new Error(result.error.message);
        if (result.value.trackersUpdated === 0 && result.value.errors.length > 0) {
            throw new Error(result.value.errors.join('; '));
        }
    });
}

export async function scheduleCallItSync(
    tasks: TasksService,
    minutes: number,
): Promise<Awaited<ReturnType<TasksService['scheduleTask']>>> {
    const interval = (CALL_IT_UPDATE_INTERVALS as readonly number[]).includes(minutes)
        ? minutes as CallItUpdateInterval
        : 15 as CallItUpdateInterval;
    return tasks.scheduleTask(
        CALL_IT_SYNC_SCHEDULE_KEY,
        CALL_IT_SYNC_TASK,
        {},
        cronForInterval(interval),
    );
}

export async function setupCallItSync(tasks: TasksService, service: CallItService): Promise<void> {
    const settings = await service.getSettings();
    if (!settings.ok) throw new Error(settings.error.message);
    const scheduled = await scheduleCallItSync(tasks, settings.value.updateIntervalMinutes);
    if (!scheduled.ok) throw new Error(scheduled.error.message);
    const queued = await tasks.enqueueTask(CALL_IT_SYNC_TASK, {}, {
        id: `callit-sync-startup-${Date.now()}`,
    });
    if (!queued.ok) throw new Error(queued.error.message);
}
