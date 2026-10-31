import { describe, expect, it } from 'bun:test';
import { getNextCronDate, validateCronExpression } from './cron';

describe('task cron expressions', () => {
    it('finds the next matching UTC minute', () => {
        expect(getNextCronDate('0 9 * * 1-5', new Date('2026-01-02T09:00:00.000Z')))
            .toEqual(new Date('2026-01-05T09:00:00.000Z'));
    });

    it('supports lists, ranges, steps, and Sunday as 0 or 7', () => {
        expect(getNextCronDate('*/15 8-9 1,15 * 7', new Date('2026-01-04T08:00:00.000Z')))
            .toEqual(new Date('2026-01-04T08:15:00.000Z'));
        expect(getNextCronDate('0 0 * * 7', new Date('2026-01-04T00:00:00.000Z')))
            .toEqual(new Date('2026-01-11T00:00:00.000Z'));
    });

    it('uses standard cron OR semantics when both day fields are restricted', () => {
        expect(getNextCronDate('0 0 13 * 1', new Date('2026-01-13T00:00:00.000Z')))
            .toEqual(new Date('2026-01-19T00:00:00.000Z'));
    });

    it('treats stepped day-of-month fields as restricted rather than wildcards', () => {
        expect(getNextCronDate('0 0 */2 * 1', new Date('2026-01-06T00:00:00.000Z')))
            .toEqual(new Date('2026-01-07T00:00:00.000Z'));
    });

    it('treats a full-step wildcard as unrestricted when the weekday field is constrained', () => {
        expect(getNextCronDate('0 0 */1 * 1', new Date('2026-01-06T00:00:00.000Z')))
            .toEqual(new Date('2026-01-12T00:00:00.000Z'));
    });

    it('rejects malformed or out-of-range expressions', () => {
        expect(validateCronExpression('*/5 * * * *')).toBe(true);
        expect(validateCronExpression('60 * * * *')).toBe(false);
        expect(validateCronExpression('0 0 * *')).toBe(false);
        expect(validateCronExpression('0 0 32 * *')).toBe(false);
        expect(validateCronExpression('/1 * * * *')).toBe(false);
        expect(validateCronExpression('1e1 * * * *')).toBe(false);
    });
});