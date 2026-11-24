import { describe, expect, it } from 'bun:test';
import {
    compactFlatHistory,
    FLAT_RUN_THRESHOLD_MS,
    historyPointPercent,
} from '../frontend/src/lib/components/callit/history';

function point(observedAt: string, price: number) {
    return { observedAt, price };
}

describe('compactFlatHistory', () => {
    it('drops long closed-market runs and connects the close to the next move', () => {
        const points = [
            point('2026-01-02T15:45:00.000Z', 100),
            point('2026-01-02T16:00:00.000Z', 100),
            point('2026-01-02T18:00:00.000Z', 100),
            point('2026-01-02T20:00:00.000Z', 100),
            point('2026-01-05T09:30:00.000Z', 101),
        ];

        const result = compactFlatHistory(points, FLAT_RUN_THRESHOLD_MS);
        expect(result.map((entry) => entry.price)).toEqual([100, 101]);
        expect(result[0]?.observedAt).toBe('2026-01-02T15:45:00.000Z');
        expect(result[1]?.observedAt).toBe('2026-01-05T09:30:00.000Z');
    });

    it('keeps the first point of a long flat run even when the closing price changed', () => {
        const points = [
            point('2026-01-02T15:45:00.000Z', 100),
            point('2026-01-02T16:00:00.000Z', 101),
            point('2026-01-02T20:00:00.000Z', 101),
            point('2026-01-05T09:30:00.000Z', 102),
        ];

        expect(compactFlatHistory(points, FLAT_RUN_THRESHOLD_MS).map((entry) => entry.price))
            .toEqual([100, 101, 102]);
    });

    it('keeps short flat runs intact', () => {
        const points = [
            point('2026-01-02T15:45:00.000Z', 100),
            point('2026-01-02T16:00:00.000Z', 100),
            point('2026-01-02T16:15:00.000Z', 100),
        ];

        expect(compactFlatHistory(points, FLAT_RUN_THRESHOLD_MS)).toHaveLength(3);
    });

    it('compresses a two-point overnight flat run', () => {
        const points = [
            point('2026-01-02T20:00:00.000Z', 100),
            point('2026-01-05T09:30:00.000Z', 100),
        ];

        expect(compactFlatHistory(points, FLAT_RUN_THRESHOLD_MS)).toHaveLength(1);
    });
});

describe('historyPointPercent', () => {
    it('positions points by timestamp instead of index', () => {
        const first = '2021-01-01T00:00:00.000Z';
        const last = '2026-01-01T00:00:00.000Z';
        const midpoint = new Date((Date.parse(first) + Date.parse(last)) / 2).toISOString();

        expect(historyPointPercent(first, first, last)).toBe(0);
        expect(historyPointPercent(midpoint, first, last)).toBeCloseTo(50, 5);
        expect(historyPointPercent(last, first, last)).toBe(100);
    });

    it('returns zero for invalid timestamps or empty ranges', () => {
        expect(historyPointPercent('not-a-date', '2021-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(0);
        expect(historyPointPercent('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2021-01-01T00:00:00.000Z')).toBe(0);
    });
});
