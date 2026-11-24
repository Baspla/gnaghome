import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { ok } from '../../lib/result';
import { TasksService } from '../../platform/tasks/service';
import type { CallItService } from './service';
import {
    CALL_IT_SYNC_SCHEDULE_KEY,
    CALL_IT_SYNC_TASK,
    cronForInterval,
    registerCallItTasks,
    scheduleCallItSync,
    setupCallItSync,
} from './tasks';

describe('Call It tasks', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let tasks: TasksService;
    let syncPrices: ReturnType<typeof mock>;
    let service: CallItService;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        tasks = new TasksService(database.db);
        syncPrices = mock(async () => ok({ trackersUpdated: 1, predictionsResolved: 0, errors: [] }));
        service = {
            syncPrices,
            getSettings: async () => ok({
                updateIntervalMinutes: 15,
                maxActivePredictionsPerUser: 6,
                lastSyncAt: null,
                lastSyncError: null,
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            }),
        } as unknown as CallItService;
    });

    afterEach(() => database.close());

    it('builds cron expressions for supported intervals', () => {
        expect(cronForInterval(5)).toBe('*/5 * * * *');
        expect(cronForInterval(30)).toBe('*/30 * * * *');
        expect(cronForInterval(60)).toBe('0 * * * *');
    });

    it('registers a worker that runs the price sync', async () => {
        registerCallItTasks(tasks, service);
        const queued = await tasks.enqueueTask(CALL_IT_SYNC_TASK, {}, { id: 'sync-1' });
        expect(queued.ok).toBe(true);
        expect(await tasks.runOnce()).toMatchObject({ ok: true, value: { status: 'succeeded' } });
        expect(syncPrices).toHaveBeenCalledTimes(1);
    });

    it('persists a recurring schedule using the configured interval', async () => {
        const scheduled = await scheduleCallItSync(tasks, 30);
        expect(scheduled).toMatchObject({
            ok: true,
            value: { scheduleKey: CALL_IT_SYNC_SCHEDULE_KEY, cronExpression: '*/30 * * * *' },
        });
        const state = await tasks.getTaskState();
        expect(state).toMatchObject({
            ok: true,
            value: { schedules: [{ scheduleKey: CALL_IT_SYNC_SCHEDULE_KEY, taskType: CALL_IT_SYNC_TASK }] },
        });
    });

    it('sets up the schedule and queues an immediate startup sync', async () => {
        registerCallItTasks(tasks, service);
        await setupCallItSync(tasks, service);
        const state = await tasks.getTaskState();
        expect(state).toMatchObject({
            ok: true,
            value: {
                schedules: [{ scheduleKey: CALL_IT_SYNC_SCHEDULE_KEY }],
                tasks: [{ taskType: CALL_IT_SYNC_TASK, status: 'queued' }],
            },
        });
    });
});
