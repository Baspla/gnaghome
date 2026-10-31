import { describe, expect, it } from 'bun:test';
import { createDatabase } from '../../db/connection';
import { user } from '../users/schema';
import { notificationPreference, dailyReminderSchedule, notificationTopic } from './schema';
import { storedFile } from '../files/schema';
import { getBerlinDayRange, getRandomBerlinReminderTime, runDailyCrewNowReminder } from './reminder';
import { crewNowPost } from '../../apps/crewnow/schema';

describe('CrewNow reminder time helpers', () => {
    it('chooses a random server-wide time within 09:00–20:00 Europe/Berlin', () => {
        const morning = getRandomBerlinReminderTime('2026-01-15', () => 0);
        const evening = getRandomBerlinReminderTime('2026-01-15', () => 0.999999);

        expect(morning?.toISOString()).toBe('2026-01-15T08:00:00.000Z');
        expect(evening?.getTime()).toBeLessThanOrEqual(new Date('2026-01-15T19:59:00.000Z').getTime());
        expect(evening?.getTime()).toBeGreaterThanOrEqual(new Date('2026-01-15T18:00:00.000Z').getTime());
    });

    it('converts Berlin local reminder times correctly across daylight-saving time', () => {
        expect(getRandomBerlinReminderTime('2026-01-15', () => 0)?.toISOString())
            .toBe('2026-01-15T08:00:00.000Z');
        expect(getRandomBerlinReminderTime('2026-07-15', () => 0)?.toISOString())
            .toBe('2026-07-15T07:00:00.000Z');
    });

    it('rejects invalid Berlin calendar dates and random values', () => {
        expect(getRandomBerlinReminderTime('2026-02-31', () => 0)).toBeNull();
        expect(getRandomBerlinReminderTime('2026-01-15', () => 1)).toBeNull();
    });

    it('uses the actual 23- and 25-hour Berlin local-day bounds on DST transitions', () => {
        const spring = getBerlinDayRange(new Date('2026-03-29T12:00:00.000Z'));
        const autumn = getBerlinDayRange(new Date('2026-10-25T12:00:00.000Z'));

        expect(spring.end.getTime() - spring.start.getTime()).toBe(23 * 60 * 60 * 1000);
        expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * 60 * 60 * 1000);
    });

    it('sends once only to opted-in users who did not post during the Berlin day', async () => {
        const database = await createDatabase(':memory:');
        try {
            await database.db.insert(user).values([
                { id: 'user-1', name: 'Alice', email: 'alice@example.test' },
                { id: 'user-2', name: 'Bob', email: 'bob@example.test' },
                { id: 'user-3', name: 'Cara', email: 'cara@example.test' },
            ]);
            await database.db.insert(notificationTopic).values({
                id: 'crewnow.daily-reminder', appId: 'crewnow', label: 'Tägliche Erinnerung', description: 'Erinnerung',
                createdAt: new Date(), updatedAt: new Date(),
            });
            const start = getBerlinDayRange(new Date('2026-01-15T12:00:00.000Z'));
            await database.db.insert(notificationPreference).values([
                { userId: 'user-1', topicId: 'crewnow.daily-reminder', enabled: true, updatedAt: new Date() },
                { userId: 'user-2', topicId: 'crewnow.daily-reminder', enabled: true, updatedAt: new Date() },
                { userId: 'user-3', topicId: 'crewnow.daily-reminder', enabled: false, updatedAt: new Date() },
            ]);
            await database.db.insert(storedFile).values([
                { id: 'back-1', storageKey: 'back-1', uploadedByUserId: 'user-1', mimeType: 'image/png', size: 1, status: 'ready', isPrivate: false },
                { id: 'front-1', storageKey: 'front-1', uploadedByUserId: 'user-1', mimeType: 'image/png', size: 1, status: 'ready', isPrivate: false },
            ]);
            await database.db.insert(crewNowPost).values({
                id: 'post-1', authorUserId: 'user-1', backImageFileId: 'back-1', frontImageFileId: 'front-1',
                discussionId: null, caption: null, createdAt: new Date('2026-01-15T10:00:00.000Z'), updatedAt: new Date('2026-01-15T10:00:00.000Z'),
            });
            await database.db.insert(dailyReminderSchedule).values({
                day: start.day,
                dueAt: new Date('2026-01-15T08:00:00.000Z'),
                sentAt: null,
                createdAt: new Date('2026-01-15T00:00:00.000Z'),
            });
            const calls: Array<{ topicId: string; userIds: readonly string[] }> = [];
            const notifications = { notifyUsers: async (topicId: string, userIds: readonly string[]) => { calls.push({ topicId, userIds }); } };

            expect(await runDailyCrewNowReminder(database.db, notifications, start.day, new Date('2026-01-15T10:00:00.000Z')))
                .toMatchObject({ ok: true, value: { sent: true } });
            expect(calls).toEqual([{ topicId: 'crewnow.daily-reminder', userIds: ['user-2'] }]);
            expect(await runDailyCrewNowReminder(database.db, notifications, start.day, new Date('2026-01-15T10:01:00.000Z')))
                .toMatchObject({ ok: true, value: { sent: false } });
            expect(calls).toHaveLength(1);
        } finally {
            database.close();
        }
    });
});