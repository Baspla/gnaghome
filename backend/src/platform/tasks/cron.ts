type CronField = {
    values: Set<number>;
    wildcard: boolean;
};

type CronExpression = [CronField, CronField, CronField, CronField, CronField];

const FIELD_RANGES = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
] as const;

function parseField(field: string, min: number, max: number): CronField | null {
    if (!field) return null;
    const values = new Set<number>();
    const wildcard = field === '*' || field === '*/1';

    for (const item of field.split(',')) {
        if (!item) return null;
        if (!/^(?:\*|\d+|\d+-\d+)(?:\/\d+)?$/.test(item)) return null;
        const [rangePart, stepPart, ...extra] = item.split('/');
        if (extra.length > 0) return null;

        const step = stepPart === undefined ? 1 : Number(stepPart);
        if (!Number.isInteger(step) || step < 1 || step > max - min + 1) return null;

        let start: number;
        let end: number;
        if (rangePart === '*') {
            start = min;
            end = max;
        } else if (rangePart.includes('-')) {
            const parts = rangePart.split('-');
            if (parts.length !== 2) return null;
            start = Number(parts[0]);
            end = Number(parts[1]);
        } else {
            start = Number(rangePart);
            // Cron permits a stepped single value, meaning that value and later values.
            end = stepPart === undefined ? start : max;
        }

        if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
            return null;
        }
        for (let value = start; value <= end; value += step) values.add(value);
    }

    return values.size > 0 ? { values, wildcard } : null;
}

function parseCron(expression: string): CronExpression | null {
    if (typeof expression !== 'string' || expression.length > 100) return null;
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const fields = parts.map((part, index) => {
        const [min, max] = FIELD_RANGES[index]!;
        return parseField(part, min, max);
    });
    if (fields.some((field) => field === null)) return null;
    return fields as CronExpression;
}

export function validateCronExpression(expression: string): boolean {
    return parseCron(expression) !== null;
}

function matchesDay(date: Date, dayOfMonth: CronField, dayOfWeek: CronField): boolean {
    const dateMatches = dayOfMonth.values.has(date.getUTCDate());
    const weekday = date.getUTCDay();
    const weekdayMatches = dayOfWeek.values.has(weekday) || (weekday === 0 && dayOfWeek.values.has(7));

    if (dayOfMonth.wildcard) return weekdayMatches;
    if (dayOfWeek.wildcard) return dateMatches;
    return dateMatches || weekdayMatches;
}

/** Returns the first matching minute strictly after `after`, interpreted in UTC. */
export function getNextCronDate(expression: string, after: Date): Date | null {
    const cron = parseCron(expression);
    if (!cron || !Number.isFinite(after.getTime())) return null;

    const [minutes, hours, dayOfMonth, months, dayOfWeek] = cron;
    const candidate = new Date(after.getTime());
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

    // Five years covers the longest useful calendar gap for this simple scheduler.
    const maxMinutes = 5 * 366 * 24 * 60;
    for (let i = 0; i < maxMinutes; i++, candidate.setUTCMinutes(candidate.getUTCMinutes() + 1)) {
        if (!minutes.values.has(candidate.getUTCMinutes())
            || !hours.values.has(candidate.getUTCHours())
            || !months.values.has(candidate.getUTCMonth() + 1)
            || !matchesDay(candidate, dayOfMonth, dayOfWeek)) continue;
        return new Date(candidate.getTime());
    }

    return null;
}