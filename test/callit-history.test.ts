import { describe, expect, it } from 'bun:test';
import {
    compactFlatHistory,
    FLAT_RUN_THRESHOLD_MS,
    historyChartPercents,
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

describe('historyChartPercents', () => {
    it('collapses the closed-market gap so the next session starts where the previous ended', () => {
        const points = [
            point('2026-01-02T15:45:00.000Z', 100),
            point('2026-01-02T16:00:00.000Z', 100),
            point('2026-01-05T09:30:00.000Z', 101),
            point('2026-01-05T09:45:00.000Z', 102),
        ];

        expect(historyChartPercents(points)).toEqual([0, 50, 50, 100]);
    });

    it('keeps points inside a session proportional to their time', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100),
            point('2026-01-05T10:30:00.000Z', 101),
            point('2026-01-05T12:30:00.000Z', 102),
        ];

        const percents = historyChartPercents(points);
        expect(percents).toHaveLength(3);
        expect(percents[0]).toBe(0);
        expect(percents[1]).toBeCloseTo(100 / 3, 5);
        expect(percents[2]).toBe(100);
    });

    it('gives every daily point its own equally wide session', () => {
        const points = [
            point('2026-01-05T20:00:00.000Z', 100),
            point('2026-01-06T20:00:00.000Z', 101),
            point('2026-01-07T20:00:00.000Z', 102),
        ];

        const percents = historyChartPercents(points);
        expect(percents).toHaveLength(3);
        const firstGap = percents[1]! - percents[0]!;
        const secondGap = percents[2]! - percents[1]!;
        expect(firstGap).toBeCloseTo(secondGap, 5);
        expect(percents[0]).toBeCloseTo(100 / 6, 5);
        expect(percents[2]).toBeCloseTo(500 / 6, 5);
    });

    it('spreads a single session across the full width', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100),
            point('2026-01-05T09:45:00.000Z', 101),
        ];

        expect(historyChartPercents(points)).toEqual([0, 100]);
    });

    it('falls back to even spacing for invalid timestamps or empty input', () => {
        expect(historyChartPercents([])).toEqual([]);
        expect(historyChartPercents([
            point('not-a-date', 100),
            point('2026-01-05T09:45:00.000Z', 101),
            point('2026-01-05T10:00:00.000Z', 102),
        ])).toEqual([0, 50, 100]);
    });
});
