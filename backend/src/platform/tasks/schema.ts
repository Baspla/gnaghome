import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const task = sqliteTable('platform_task', {
    id: text('id').primaryKey(),
    taskType: text('task_type').notNull(),
    payload: text('payload').notNull(),
    status: text('status', { enum: ['queued', 'running', 'succeeded', 'failed'] }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAt: integer('run_at', { mode: 'timestamp' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    lastError: text('last_error'),
    sourceScheduleKey: text('source_schedule_key'),
    scheduledFor: integer('scheduled_for', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
    index('platform_task_ready_idx').on(table.status, table.runAt, table.createdAt),
    index('platform_task_type_idx').on(table.taskType, table.status),
    index('platform_task_created_idx').on(table.createdAt),
    uniqueIndex('platform_task_schedule_occurrence_uidx').on(table.sourceScheduleKey, table.scheduledFor),
]);

export const taskSchedule = sqliteTable('platform_task_schedule', {
    scheduleKey: text('schedule_key').primaryKey(),
    taskType: text('task_type').notNull(),
    payload: text('payload').notNull(),
    cronExpression: text('cron_expression').notNull(),
    maxAttempts: integer('max_attempts').notNull().default(3),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    nextRunAt: integer('next_run_at', { mode: 'timestamp' }).notNull(),
    lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
    index('platform_task_schedule_due_idx').on(table.enabled, table.nextRunAt),
]);

export type TaskRecord = typeof task.$inferSelect;
export type TaskScheduleRecord = typeof taskSchedule.$inferSelect;