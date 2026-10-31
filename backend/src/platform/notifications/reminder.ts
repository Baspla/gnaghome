import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import type { AppDatabase } from '../../db/connection';
import { err, ok, type InternalError, type Result } from '../../lib/result';
import { crewNowPost } from '../../apps/crewnow/schema';
import { notificationPreference, dailyReminderSchedule } from './schema';
import { notificationTopic } from './schema';
import type { NotificationsService } from './service';
import type { TasksService } from '../tasks/service';

declare module '../tasks/service' {
    interface TaskPayloadMap {
        'notifications.crewnow-reminder.prepare': Record<string, never>;
        'notifications.crewnow-reminder.deliver': { day: string };
    }
}

const BERLIN_TIME_ZONE = 'Europe/Berlin';
const REMINDER_TOPIC = 'crewnow.daily-reminder';

type BerlinDateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(date: Date, timeZone = BERLIN_TIME_ZONE): BerlinDateParts {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        year: Number(values.year), month: Number(values.month), day: Number(values.day),
        hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
    };
}

function dayKey(parts: Pick<BerlinDateParts, 'year' | 'month' | 'day'>): string {
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Convert a Berlin wall-clock date/time into a UTC Date without assuming a fixed UTC offset. */
function berlinWallTimeToUtc(day: string, hour: number, minute: number): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return null;
    const [, yearText, monthText, dateText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const date = Number(dateText);
    if (month < 1 || month > 12 || date < 1 || date > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    const normalizedDate = new Date(Date.UTC(year, month - 1, date));
    if (normalizedDate.getUTCFullYear() !== year
        || normalizedDate.getUTCMonth() + 1 !== month
        || normalizedDate.getUTCDate() !== date) return null;
    const desired = Date.UTC(year, month - 1, date, hour, minute);
    let guess = desired;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const local = partsAt(new Date(guess));
        const rendered = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
        const correction = desired - rendered;
        if (correction === 0) return new Date(guess);
        guess += correction;
    }
    const result = new Date(guess);
    const actual = partsAt(result);
    return dayKey(actual) === day && actual.hour === hour && actual.minute === minute ? result : null;
}

export function getRandomBerlinReminderTime(day: string, random: () => number = Math.random, earliest?: Date): Date | null {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
    // A random integer minute between the later of now/09:00 and 20:00 Berlin.
    let earliestMinute = 9 * 60;
    if (earliest) {
        const local = partsAt(earliest);
        if (dayKey(local) !== day) return null;
        earliestMinute = Math.max(earliestMinute, local.hour * 60 + local.minute + (local.second > 0 ? 1 : 0));
    }
    if (earliestMinute > 20 * 60) return null;
    const minutesAfterMidnight = earliestMinute + Math.floor(value * (20 * 60 - earliestMinute + 1));
    return berlinWallTimeToUtc(day, Math.floor(minutesAfterMidnight / 60), minutesAfterMidnight % 60);
}

export function getBerlinDayRangeForDay(day: string): { day: string; start: Date; end: Date } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) return null;
    const [, yearText, monthText, dateText] = match;
    const todayParts = { year: Number(yearText), month: Number(monthText), day: Number(dateText) };
    if (todayParts.month < 1 || todayParts.month > 12 || todayParts.day < 1 || todayParts.day > 31) return null;
    const normalizedDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
    if (normalizedDate.getUTCFullYear() !== todayParts.year
        || normalizedDate.getUTCMonth() + 1 !== todayParts.month
        || normalizedDate.getUTCDate() !== todayParts.day) return null;
    const start = berlinWallTimeToUtc(day, 0, 0);
    const nextDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1));
    const nextDay = dayKey({ year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() + 1, day: nextDate.getUTCDate() });
    const end = berlinWallTimeToUtc(nextDay, 0, 0);
    if (!start || !end) return null;
    return { day, start, end };
}

export function getBerlinDayRange(now: Date): { day: string; start: Date; end: Date } {
    const day = dayKey(partsAt(now));
    const range = getBerlinDayRangeForDay(day);
    if (!range) throw new Error('Could not calculate Europe/Berlin day boundary');
    return range;
}

export async function runDailyCrewNowReminder(
    db: AppDatabase,
    notifications: Pick<NotificationsService, 'notifyUsers'>,
    day: string,
    now: Date = new Date(),
): Promise<Result<{ day: string; sent: boolean }, InternalError>> {
    try {
        const range = getBerlinDayRangeForDay(day);
        if (!range) return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Reminder day is invalid' });
        const [schedule] = await db.select().from(dailyReminderSchedule).where(eq(dailyReminderSchedule.day, range.day)).limit(1);
        if (!schedule) return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Reminder schedule could not be loaded' });
        if (schedule.sentAt || now < schedule.dueAt) return ok({ day: range.day, sent: false });
        if (getBerlinDayRange(now).day !== day) {
            await db.update(dailyReminderSchedule).set({ sentAt: now })
                .where(and(eq(dailyReminderSchedule.day, day), isNull(dailyReminderSchedule.sentAt)));
            return ok({ day, sent: false });
        }

        const optedIn = await db.select({ userId: notificationPreference.userId })
            .from(notificationPreference)
            .where(and(
                eq(notificationPreference.topicId, REMINDER_TOPIC),
                eq(notificationPreference.enabled, true),
            ));
        const posted = optedIn.length === 0 ? [] : await db.select({ userId: crewNowPost.authorUserId })
            .from(crewNowPost)
            .where(and(
                inArray(crewNowPost.authorUserId, optedIn.map((row) => row.userId)),
                gte(crewNowPost.createdAt, range.start),
                lt(crewNowPost.createdAt, range.end),
            ));
        const postedIds = new Set(posted.map((row) => row.userId));
        const recipients = optedIn.map((row) => row.userId).filter((id) => !postedIds.has(id));
        const [claimed] = await db.update(dailyReminderSchedule).set({ sentAt: now })
            .where(and(eq(dailyReminderSchedule.day, range.day), isNull(dailyReminderSchedule.sentAt)))
            .returning({ day: dailyReminderSchedule.day });
        if (!claimed) return ok({ day: range.day, sent: false });
        await notifications.notifyUsers(REMINDER_TOPIC, recipients, {
            title: 'Zeit für einen CrewNow?',
            body: 'Teile deinen Moment mit der Gruppe.',
            url: '/crewnow/create',
        });
        return ok({ day: range.day, sent: true });
    } catch {
        return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Daily CrewNow reminder failed' });
    }
}

async function prepareReminderForToday(
    db: AppDatabase,
    tasks: TasksService,
    now: Date,
): Promise<void> {
    const range = getBerlinDayRange(now);
    await db.insert(notificationTopic).values({
        id: REMINDER_TOPIC,
        appId: 'crewnow',
        label: 'Tägliche Erinnerung zum Posten',
        description: 'Ein zufälliger Hinweis zwischen 09:00 und 20:00 Uhr, falls du heute noch nichts gepostet hast.',
        createdAt: now,
        updatedAt: now,
    }).onConflictDoNothing();
    const dueAt = getRandomBerlinReminderTime(range.day, Math.random, now);
    if (!dueAt) {
        await db.insert(dailyReminderSchedule).values({ day: range.day, dueAt: now, sentAt: now, createdAt: now }).onConflictDoNothing();
        return;
    }
    await db.insert(dailyReminderSchedule).values({ day: range.day, dueAt, sentAt: null, createdAt: now }).onConflictDoNothing();
    const [schedule] = await db.select().from(dailyReminderSchedule).where(eq(dailyReminderSchedule.day, range.day)).limit(1);
    if (!schedule) throw new Error('Reminder schedule could not be loaded');
    const queued = await tasks.enqueueTask('notifications.crewnow-reminder.deliver', { day: range.day }, {
        id: `crewnow-reminder-${range.day}`,
        runAt: schedule.dueAt,
    });
    if (!queued.ok) throw new Error(queued.error.message);
}

export function registerDailyCrewNowReminder(tasks: TasksService, db: AppDatabase, notifications: NotificationsService): void {
    tasks.registerWorker('notifications.crewnow-reminder.prepare', async () => {
        await prepareReminderForToday(db, tasks, new Date());
    });
    tasks.registerWorker('notifications.crewnow-reminder.deliver', async ({ day }) => {
        const result = await runDailyCrewNowReminder(db, notifications, day, new Date());
        if (!result.ok) throw new Error(result.error.message);
    });
}

export async function setupDailyCrewNowReminder(tasks: TasksService): Promise<void> {
    const schedule = await tasks.scheduleTask(
        'notifications.crewnow-reminder-daily-prepare',
        'notifications.crewnow-reminder.prepare',
        {},
        '0 0 * * *',
    );
    if (!schedule.ok) throw new Error(schedule.error.message);
    const queued = await tasks.enqueueTask('notifications.crewnow-reminder.prepare', {}, {
        id: `crewnow-reminder-prepare-${getBerlinDayRange(new Date()).day}`,
    });
    if (!queued.ok) throw new Error(queued.error.message);
}