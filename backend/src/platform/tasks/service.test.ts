import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { createDatabase } from '../../db/connection';
import { task, taskSchedule } from './schema';
import { TasksService, type TaskPayloadMap } from './service';

type TestTaskPayloads = TaskPayloadMap & {
    'test.collect': { value: string };
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
    if (!result.ok) throw result.error;
    return result.value;
}

describe('TasksService', () => {
    let database: Awaited<ReturnType<typeof createDatabase>>;
    let now: Date;
    let service: TasksService<TestTaskPayloads>;

    beforeEach(async () => {
        database = await createDatabase(':memory:');
        now = new Date('2026-01-01T00:00:00.000Z');
        service = new TasksService<TestTaskPayloads>(database.db, { clock: () => new Date(now) });
    });

    afterEach(() => database.close());

    it('durably enqueues work and runs its registered worker', async () => {
        const handled: string[] = [];
        service.registerWorker('test.collect', async ({ value }) => { handled.push(value); });
        const enqueued = await service.enqueueTask('test.collect', { value: 'hello' });

        expect(enqueued.ok).toBe(true);
        if (!enqueued.ok) return;
        expect(enqueued.value.status).toBe('queued');

        const run = await service.runOnce();
        expect(run).toMatchObject({ ok: true, value: { status: 'succeeded', attempts: 1 } });
        expect(handled).toEqual(['hello']);
        expect(unwrap(await service.getTaskState()).tasks).toMatchObject([
            { id: enqueued.value.id, taskType: 'test.collect', status: 'succeeded', attempts: 1 },
        ]);
    });

    it('supports stable caller-supplied task IDs for idempotent scheduled work', async () => {
        const first = await service.enqueueTask('test.collect', { value: 'once' }, { id: 'stable-delivery-id', runAt: new Date('2026-01-01T10:00:00.000Z') });
        const retry = await service.enqueueTask('test.collect', { value: 'duplicate' }, { id: 'stable-delivery-id', runAt: new Date('2026-01-01T10:00:00.000Z') });

        expect(first).toMatchObject({ ok: true, value: { id: 'stable-delivery-id', payload: '{"value":"once"}' } });
        expect(retry).toMatchObject({ ok: true, value: { id: 'stable-delivery-id', payload: '{"value":"once"}' } });
        expect(await database.db.select().from(task).where(eq(task.id, 'stable-delivery-id'))).toHaveLength(1);
    });

    it('retries a failed worker up to the configured attempt limit and retains the error', async () => {
        let attempts = 0;
        service.registerWorker('test.collect', async () => { attempts++; throw new Error('temporarily unavailable'); });
        const enqueued = await service.enqueueTask('test.collect', { value: 'retry' }, { maxAttempts: 2 });
        expect(enqueued.ok).toBe(true);

        await service.runOnce();
        expect(unwrap(await service.getTaskState()).tasks[0]).toMatchObject({
            status: 'queued', attempts: 1, lastError: 'temporarily unavailable',
        });

        now = new Date(now.getTime() + 60_000);
        await service.runOnce();
        expect(attempts).toBe(2);
        expect(unwrap(await service.getTaskState()).tasks[0]).toMatchObject({
            status: 'failed', attempts: 2, lastError: 'temporarily unavailable',
        });
    });

    it('creates recurring schedules, enqueues due occurrences once, and advances their next run', async () => {
        service.registerWorker('test.collect', async () => {});
        const created = await service.scheduleTask('daily-collector', 'test.collect', { value: 'scheduled' }, '0 0 * * *');

        expect(created.ok).toBe(true);
        if (!created.ok) return;
        expect(created.value.nextRunAt).toEqual(new Date('2026-01-02T00:00:00.000Z'));

        now = new Date('2026-01-02T00:00:00.000Z');
        await service.runOnce();
        await service.runOnce();

        expect(unwrap(await service.getTaskState()).tasks).toHaveLength(1);
        expect(unwrap(await service.getTaskState()).schedules[0]).toMatchObject({
            scheduleKey: 'daily-collector',
            lastRunAt: now,
            nextRunAt: new Date('2026-01-03T00:00:00.000Z'),
        });
    });

    it('skips missed repeated occurrences after downtime rather than flooding the queue', async () => {
        const created = await service.scheduleTask('daily-collector', 'test.collect', { value: 'scheduled' }, '0 0 * * *');
        expect(created.ok).toBe(true);

        now = new Date('2026-01-05T12:00:00.000Z');
        await service.runOnce();

        const state = unwrap(await service.getTaskState());
        expect(state.tasks).toHaveLength(1);
        expect(state.tasks[0]).toMatchObject({ scheduledFor: new Date('2026-01-02T00:00:00.000Z') });
        expect(state.schedules[0]).toMatchObject({
            lastRunAt: new Date('2026-01-02T00:00:00.000Z'),
            nextRunAt: new Date('2026-01-06T00:00:00.000Z'),
        });
    });

    it('allows only one of two runners to claim a queued task', async () => {
        let handled = 0;
        service.registerWorker('test.collect', async () => { handled++; });
        const secondRunner = new TasksService<TestTaskPayloads>(database.db, { clock: () => new Date(now) });
        secondRunner.registerWorker('test.collect', async () => { handled++; });
        await service.enqueueTask('test.collect', { value: 'once' });

        await Promise.all([service.runOnce(), secondRunner.runOnce()]);

        expect(handled).toBe(1);
        expect(unwrap(await service.getTaskState()).tasks[0]).toMatchObject({ status: 'succeeded', attempts: 1 });
    });

    it('rejects invalid cron schedules without persisting them', async () => {
        const result = await service.scheduleTask('invalid', 'test.collect', { value: 'nope' }, '61 * * * *');

        expect(result).toMatchObject({ ok: false, error: { status: 400 } });
        expect(await database.db.select().from(taskSchedule)).toHaveLength(0);
    });

    it('can pause a recurring schedule without deleting its configuration', async () => {
        await service.scheduleTask('nightly', 'test.collect', { value: 'scheduled' }, '0 0 * * *');

        const paused = await service.setScheduleEnabled('nightly', false);
        expect(paused).toMatchObject({ ok: true, value: { scheduleKey: 'nightly', enabled: false } });

        now = new Date('2026-01-02T00:00:00.000Z');
        await service.runOnce();
        expect(unwrap(await service.getTaskState()).tasks).toHaveLength(0);
    });

    it('reports queued, running, completed, and scheduled task state for future admin use', async () => {
        const queued = await service.enqueueTask('test.collect', { value: 'queued' });
        expect(queued.ok).toBe(true);
        await service.scheduleTask('nightly', 'test.collect', { value: 'scheduled' }, '0 0 * * *');
        if (!queued.ok) return;
        await database.db.update(task).set({ status: 'running', startedAt: now }).where(eq(task.id, queued.value.id));

        const state = unwrap(await service.getTaskState());
        expect(state.tasks[0]).toMatchObject({ status: 'running', taskType: 'test.collect' });
        expect(state.schedules[0]).toMatchObject({ scheduleKey: 'nightly', enabled: true });
        expect(state.tasks[0]).not.toHaveProperty('payload');
        expect(state.schedules[0]).not.toHaveProperty('payload');
    });

    it('recovers tasks left running by a process restart', async () => {
        const enqueued = await service.enqueueTask('test.collect', { value: 'restart' });
        expect(enqueued.ok).toBe(true);
        if (!enqueued.ok) return;
        await database.db.update(task).set({ status: 'running', startedAt: now }).where(eq(task.id, enqueued.value.id));

        const recovered = await service.recoverInterruptedTasks();

        expect(recovered).toMatchObject({ ok: true, value: 1 });
        expect(unwrap(await service.getTaskState()).tasks[0]).toMatchObject({ status: 'queued', startedAt: null });
    });
});