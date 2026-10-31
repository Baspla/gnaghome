import { randomUUID } from 'node:crypto';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type BadRequestError, type InternalError, type NotFoundError, type Result } from '../../lib/result';
import { createLogger } from '../../lib/logger';
import { getNextCronDate, validateCronExpression } from './cron';
import { task, taskSchedule, type TaskRecord, type TaskScheduleRecord } from './schema';

const logger = createLogger('tasks');
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ALLOWED_ATTEMPTS = 20;
const RETRY_DELAY_MS = 60_000;
const MAX_ERROR_LENGTH = 2_000;
const POLL_INTERVAL_MS = 1_000;

type JsonPayload = Record<string, unknown>;

/** Backend modules can augment this interface to define named task payloads. */
export interface TaskPayloadMap {}

type TaskName<Payloads extends TaskPayloadMap> = keyof Payloads extends never
    ? string
    : Extract<keyof Payloads, string>;
type TaskPayload<Payloads extends TaskPayloadMap, TType extends string> = TType extends keyof Payloads
    ? Payloads[TType]
    : JsonPayload;

export type TaskWorker<Payload> = (payload: Payload) => void | Promise<void>;

export type TaskState = {
    tasks: Array<Omit<TaskRecord, 'payload'>>;
    schedules: Array<Omit<TaskScheduleRecord, 'payload'>>;
};

export type TaskRunResult = {
    status: 'succeeded' | 'queued' | 'failed';
    attempts: number;
};

type TasksServiceOptions = {
    clock?: () => Date;
    pollIntervalMs?: number;
};

function serializePayload(payload: unknown): string | null {
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
    try {
        const value = JSON.stringify(payload);
        return value === undefined ? null : value;
    } catch {
        return null;
    }
}

function parsePayload(payload: string): unknown {
    return JSON.parse(payload) as unknown;
}

function errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, MAX_ERROR_LENGTH) || 'Task failed without an error message';
}

function validIdentifier(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

export class TasksService<Payloads extends TaskPayloadMap = TaskPayloadMap> {
    private readonly workers = new Map<string, (payload: unknown) => void | Promise<void>>();
    private readonly clock: () => Date;
    private readonly pollIntervalMs: number;
    private pollTimer: ReturnType<typeof setInterval> | undefined;
    private runInProgress = false;
    private activeRun: Promise<Result<TaskRunResult | null, InternalError>> | undefined;

    constructor(
        private readonly db: AppDatabase,
        options: TasksServiceOptions = {},
    ) {
        this.clock = options.clock ?? (() => new Date());
        this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    }

    registerWorker<TType extends TaskName<Payloads>>(
        taskType: TType,
        worker: TaskWorker<TaskPayload<Payloads, TType>>,
    ): void {
        if (!validIdentifier(taskType)) throw new Error('Task type must be a non-empty string of at most 128 characters');
        if (this.workers.has(taskType)) throw new Error(`A worker is already registered for task type "${taskType}"`);
        this.workers.set(taskType, (payload) => worker(payload as TaskPayload<Payloads, TType>));
    }

    async enqueueTask<TType extends TaskName<Payloads>>(
        taskType: TType,
        payload: TaskPayload<Payloads, TType>,
        options: { maxAttempts?: number; id?: string; runAt?: Date } = {},
    ): Promise<Result<TaskRecord, BadRequestError | InternalError>> {
        const serialized = serializePayload(payload);
        const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        if (!validIdentifier(taskType) || serialized === null
            || (options.id !== undefined && !validIdentifier(options.id))
            || (options.runAt !== undefined && (!(options.runAt instanceof Date) || !Number.isFinite(options.runAt.getTime())))
            || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ALLOWED_ATTEMPTS) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Invalid task type, payload, or retry limit' });
        }

        const now = this.clock();
        const record: TaskRecord = {
            id: options.id ?? randomUUID(),
            taskType,
            payload: serialized,
            status: 'queued',
            attempts: 0,
            maxAttempts,
            runAt: options.runAt ?? now,
            startedAt: null,
            finishedAt: null,
            lastError: null,
            sourceScheduleKey: null,
            scheduledFor: null,
            createdAt: now,
            updatedAt: now,
        };

        try {
            const [created] = await this.db.insert(task).values(record).onConflictDoNothing({ target: task.id }).returning();
            if (created) return ok(created);
            const [existing] = await this.db.select().from(task).where(eq(task.id, record.id)).limit(1);
            return existing ? ok(existing) : ok(record);
        } catch (error) {
            logger.error('failed to enqueue task', { taskType, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to enqueue task' });
        }
    }

    async scheduleTask<TType extends TaskName<Payloads>>(
        scheduleKey: string,
        taskType: TType,
        payload: TaskPayload<Payloads, TType>,
        cronExpression: string,
        options: { maxAttempts?: number } = {},
    ): Promise<Result<TaskScheduleRecord, BadRequestError | InternalError>> {
        const serialized = serializePayload(payload);
        const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        const now = this.clock();
        const nextRunAt = getNextCronDate(cronExpression, now);
        if (!validIdentifier(scheduleKey) || !validIdentifier(taskType) || serialized === null
            || !validateCronExpression(cronExpression) || !nextRunAt
            || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ALLOWED_ATTEMPTS) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Invalid schedule key, task payload, cron expression, or retry limit' });
        }

        try {
            const [record] = await this.db.insert(taskSchedule).values({
                scheduleKey,
                taskType,
                payload: serialized,
                cronExpression,
                maxAttempts,
                enabled: true,
                nextRunAt,
                lastRunAt: null,
                createdAt: now,
                updatedAt: now,
            }).onConflictDoUpdate({
                target: taskSchedule.scheduleKey,
                set: {
                    taskType,
                    payload: serialized,
                    cronExpression,
                    maxAttempts,
                    enabled: true,
                    nextRunAt,
                    updatedAt: now,
                },
            }).returning();
            if (!record) throw new Error('Schedule upsert returned no row');
            return ok(record);
        } catch (error) {
            logger.error('failed to save task schedule', { scheduleKey, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to save task schedule' });
        }
    }

    async setScheduleEnabled(
        scheduleKey: string,
        enabled: boolean,
    ): Promise<Result<TaskScheduleRecord, BadRequestError | NotFoundError | InternalError>> {
        if (!validIdentifier(scheduleKey) || typeof enabled !== 'boolean') {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Invalid task schedule update' });
        }
        try {
            const now = this.clock();
            const [record] = await this.db.update(taskSchedule)
                .set({ enabled, updatedAt: now })
                .where(eq(taskSchedule.scheduleKey, scheduleKey))
                .returning();
            return record
                ? ok(record)
                : err({ status: 404, code: 'NOT_FOUND', message: 'Task schedule not found' });
        } catch (error) {
            logger.error('failed to update task schedule', { scheduleKey, error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to update task schedule' });
        }
    }

    async getTaskState(): Promise<Result<TaskState, InternalError>> {
        try {
            const [tasks, schedules] = await Promise.all([
                this.db.select().from(task).orderBy(asc(task.createdAt), asc(task.id)),
                this.db.select().from(taskSchedule).orderBy(asc(taskSchedule.scheduleKey)),
            ]);
            return ok({
                tasks: tasks.map(({ payload: _payload, ...record }) => record),
                schedules: schedules.map(({ payload: _payload, ...record }) => record),
            });
        } catch (error) {
            logger.error('failed to read task state', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to read task state' });
        }
    }

    async recoverInterruptedTasks(): Promise<Result<number, InternalError>> {
        const now = this.clock();
        try {
            const interrupted = await this.db.select().from(task).where(eq(task.status, 'running'));
            let recovered = 0;
            for (const record of interrupted) {
                const exhausted = record.attempts >= record.maxAttempts;
                const [updated] = await this.db.update(task).set({
                    status: exhausted ? 'failed' : 'queued',
                    runAt: now,
                    startedAt: null,
                    finishedAt: exhausted ? now : null,
                    updatedAt: now,
                    lastError: 'Worker was interrupted before the task completed',
                }).where(and(eq(task.id, record.id), eq(task.status, 'running'))).returning({ id: task.id });
                if (updated) recovered++;
            }
            return ok(recovered);
        } catch (error) {
            logger.error('failed to recover interrupted tasks', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to recover interrupted tasks' });
        }
    }

    async runOnce(): Promise<Result<TaskRunResult | null, InternalError>> {
        if (this.runInProgress) return ok(null);
        this.runInProgress = true;
        const running = this.runOnceInternal();
        this.activeRun = running;
        try {
            return await running;
        } finally {
            this.runInProgress = false;
            this.activeRun = undefined;
        }
    }

    private async runOnceInternal(): Promise<Result<TaskRunResult | null, InternalError>> {
        try {
            const materialized = await this.materializeDueSchedules();
            if (!materialized.ok) return materialized;
            const now = this.clock();
            const candidates = await this.db.select().from(task)
                .where(and(eq(task.status, 'queued'), lte(task.runAt, now)))
                .orderBy(asc(task.runAt), asc(task.createdAt))
                .limit(100);

            for (const candidate of candidates) {
                const worker = this.workers.get(candidate.taskType);
                if (!worker) continue;

                const startedAt = this.clock();
                const [claimed] = await this.db.update(task).set({
                    status: 'running',
                    attempts: sql`${task.attempts} + 1`,
                    startedAt,
                    finishedAt: null,
                    updatedAt: startedAt,
                }).where(and(
                    eq(task.id, candidate.id),
                    eq(task.status, 'queued'),
                    lte(task.runAt, startedAt),
                )).returning();
                if (!claimed) continue;

                try {
                    await worker(parsePayload(claimed.payload));
                    const completedAt = this.clock();
                    const [completed] = await this.db.update(task).set({
                        status: 'succeeded',
                        finishedAt: completedAt,
                        updatedAt: completedAt,
                        lastError: null,
                    }).where(and(eq(task.id, claimed.id), eq(task.status, 'running'))).returning();
                    return ok({ status: completed?.status === 'succeeded' ? 'succeeded' : 'failed', attempts: claimed.attempts });
                } catch (error) {
                    const failedAt = this.clock();
                    const willRetry = claimed.attempts < claimed.maxAttempts;
                    const [updated] = await this.db.update(task).set({
                        status: willRetry ? 'queued' : 'failed',
                        runAt: willRetry ? new Date(failedAt.getTime() + RETRY_DELAY_MS) : claimed.runAt,
                        startedAt: null,
                        finishedAt: willRetry ? null : failedAt,
                        updatedAt: failedAt,
                        lastError: errorMessage(error),
                    }).where(and(eq(task.id, claimed.id), eq(task.status, 'running'))).returning();
                    return ok({ status: updated?.status === 'queued' ? 'queued' : 'failed', attempts: claimed.attempts });
                }
            }
            return ok(null);
        } catch (error) {
            logger.error('task runner iteration failed', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Task runner iteration failed' });
        }
    }

    async start(): Promise<Result<null, InternalError>> {
        if (this.pollTimer) return ok(null);
        const recovered = await this.recoverInterruptedTasks();
        if (!recovered.ok) return recovered;
        this.pollTimer = setInterval(() => {
            void this.runOnce().then((result) => {
                if (!result.ok) logger.warn('task runner iteration will be retried', { error: result.error.message });
            });
        }, this.pollIntervalMs);
        this.pollTimer.unref();
        void this.runOnce().then((result) => {
            if (!result.ok) logger.warn('initial task runner iteration will be retried', { error: result.error.message });
        });
        return ok(null);
    }

    async stop(): Promise<void> {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = undefined;
        await this.activeRun;
    }

    private async materializeDueSchedules(): Promise<Result<null, InternalError>> {
        const now = this.clock();
        try {
            const dueSchedules = await this.db.select().from(taskSchedule)
                .where(and(eq(taskSchedule.enabled, true), lte(taskSchedule.nextRunAt, now)))
                .orderBy(asc(taskSchedule.nextRunAt))
                .limit(100);

            for (const schedule of dueSchedules) {
                const nextRunAt = getNextCronDate(schedule.cronExpression, now);
                if (!nextRunAt) {
                    logger.error('task schedule has no future cron occurrence', { scheduleKey: schedule.scheduleKey });
                    await this.db.update(taskSchedule)
                        .set({ enabled: false, updatedAt: now })
                        .where(and(eq(taskSchedule.scheduleKey, schedule.scheduleKey), eq(taskSchedule.nextRunAt, schedule.nextRunAt)));
                    continue;
                }

                await this.db.transaction(async (tx) => {
                    const [advanced] = await tx.update(taskSchedule).set({
                        nextRunAt,
                        lastRunAt: schedule.nextRunAt,
                        updatedAt: now,
                    }).where(and(
                        eq(taskSchedule.scheduleKey, schedule.scheduleKey),
                        eq(taskSchedule.enabled, true),
                        eq(taskSchedule.nextRunAt, schedule.nextRunAt),
                    )).returning({ scheduleKey: taskSchedule.scheduleKey });
                    if (!advanced) return;

                    await tx.insert(task).values({
                        id: randomUUID(),
                        taskType: schedule.taskType,
                        payload: schedule.payload,
                        status: 'queued',
                        attempts: 0,
                        maxAttempts: schedule.maxAttempts,
                        runAt: schedule.nextRunAt,
                        startedAt: null,
                        finishedAt: null,
                        lastError: null,
                        sourceScheduleKey: schedule.scheduleKey,
                        scheduledFor: schedule.nextRunAt,
                        createdAt: now,
                        updatedAt: now,
                    }).onConflictDoNothing();
                });
            }
            return ok(null);
        } catch (error) {
            logger.error('failed to materialize recurring tasks', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to materialize recurring tasks' });
        }
    }
}