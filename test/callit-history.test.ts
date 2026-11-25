import { describe, expect, it } from 'bun:test';
import {
    candleChartPercents,
    candleGeometries,
    chartX,
    chartY,
    compactFlatHistory,
    FLAT_RUN_THRESHOLD_MS,
    historyChartPercents,
    historyPriceScale,
    lineChartPath,
    sampleHistory,
} from '../frontend/src/lib/components/callit/history';
import type { CallItHistoryPoint } from '../frontend/src/lib/components/callit/types';

function point(
    observedAt: string,
    close: number,
    overrides: Partial<CallItHistoryPoint> = {},
): CallItHistoryPoint {
    return { observedAt, open: close, high: close, low: close, close, ...overrides };
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
        expect(result.map((entry) => entry.close)).toEqual([100, 101]);
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

        expect(compactFlatHistory(points, FLAT_RUN_THRESHOLD_MS).map((entry) => entry.close))
            .toEqual([100, 101, 102]);
    });

    it('keeps flat-close candles whose high or low changed', () => {
        const points = [
            point('2026-01-02T15:45:00.000Z', 100, { open: 100, high: 101, low: 99 }),
            point('2026-01-02T16:00:00.000Z', 100, { open: 100, high: 102, low: 98 }),
            point('2026-01-02T16:15:00.000Z', 100, { open: 100, high: 101, low: 99 }),
        ];

        expect(compactFlatHistory(points, FLAT_RUN_THRESHOLD_MS)).toHaveLength(3);
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

describe('candleChartPercents', () => {
    it('gives every candle a unique position across session boundaries', () => {
        const points: CallItHistoryPoint[] = [];
        for (let day = 0; day < 5; day += 1) {
            for (let hour = 0; hour < 7; hour += 1) {
                points.push(point(
                    new Date(Date.UTC(2026, 0, 5 + day, 14 + hour, 30)).toISOString(),
                    100 + day + hour / 10,
                ));
            }
        }

        const percents = candleChartPercents(points);
        expect(percents).toHaveLength(35);
        expect(new Set(percents).size).toBe(35);
        expect(percents.every((value, index) => index === 0 || value > percents[index - 1]!)).toBe(true);
    });

    it('insets session edges by half a candle slot', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100),
            point('2026-01-05T10:30:00.000Z', 101),
            point('2026-01-05T11:30:00.000Z', 102),
            point('2026-01-06T09:30:00.000Z', 103),
            point('2026-01-06T10:30:00.000Z', 104),
            point('2026-01-06T11:30:00.000Z', 105),
        ];

        const percents = candleChartPercents(points);
        expect(percents[0]).toBeCloseTo(100 / 12, 5);
        expect(percents[1]).toBeCloseTo(300 / 12, 5);
        expect(percents[2]).toBeCloseTo(500 / 12, 5);
        expect(percents[3]).toBeCloseTo(700 / 12, 5);
        expect(percents[4]).toBeCloseTo(900 / 12, 5);
        expect(percents[5]).toBeCloseTo(1100 / 12, 5);
    });

    it('centers single-point sessions and matches the line layout for daily data', () => {
        const points = [
            point('2026-01-05T20:00:00.000Z', 100),
            point('2026-01-06T20:00:00.000Z', 101),
            point('2026-01-07T20:00:00.000Z', 102),
        ];

        const percents = candleChartPercents(points);
        expect(percents[0]).toBeCloseTo(100 / 6, 5);
        expect(percents[1]).toBeCloseTo(300 / 6, 5);
        expect(percents[2]).toBeCloseTo(500 / 6, 5);
        expect(percents).toEqual(historyChartPercents(points));
    });

    it('falls back to centered even spacing for invalid timestamps', () => {
        expect(candleChartPercents([])).toEqual([]);
        const percents = candleChartPercents([
            point('not-a-date', 100),
            point('2026-01-05T09:45:00.000Z', 101),
            point('2026-01-05T10:00:00.000Z', 102),
        ]);
        expect(percents[0]).toBeCloseTo(100 / 6, 5);
        expect(percents[1]).toBeCloseTo(300 / 6, 5);
        expect(percents[2]).toBeCloseTo(500 / 6, 5);
    });
});

describe('sampleHistory', () => {
    it('compacts flat closed-market runs before sampling', () => {
        const points = [
            point('2026-01-02T15:45:00.000Z', 100),
            point('2026-01-02T20:00:00.000Z', 100),
            point('2026-01-05T09:30:00.000Z', 101),
        ];

        expect(sampleHistory(points)).toHaveLength(2);
    });

    it('caps the number of rendered points while keeping the endpoints', () => {
        const points = Array.from({ length: 600 }, (_, index) => point(
            new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
            100 + index,
        ));

        const sampled = sampleHistory(points, 100);
        expect(sampled).toHaveLength(100);
        expect(sampled[0]?.close).toBe(100);
        expect(sampled[sampled.length - 1]?.close).toBe(699);
    });
});

describe('historyPriceScale', () => {
    it('scales line charts by close and candlesticks by the full high/low range', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100, { high: 110, low: 90 }),
            point('2026-01-05T10:30:00.000Z', 100, { high: 120, low: 95 }),
        ];

        expect(historyPriceScale(points, 'line')).toMatchObject({ minPrice: 100, maxPrice: 100 });
        expect(historyPriceScale(points, 'candlestick')).toMatchObject({ minPrice: 90, maxPrice: 120 });
    });

    it('returns a usable scale for empty or non-finite input', () => {
        expect(historyPriceScale([], 'line')).toMatchObject({ minPrice: 0, maxPrice: 0 });
        expect(historyPriceScale([point('2026-01-05T09:30:00.000Z', Number.NaN)], 'line'))
            .toMatchObject({ minPrice: 0, maxPrice: 0 });
    });
});

describe('chart geometry', () => {
    it('maps horizontal percentages into the padded viewBox', () => {
        expect(chartX(0)).toBe(12);
        expect(chartX(100)).toBe(988);
        expect(chartX(50)).toBe(500);
    });

    it('maps higher prices to smaller y values and draws the line through closes', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100),
            point('2026-01-05T10:30:00.000Z', 102),
        ];
        const scale = historyPriceScale(points, 'line');

        expect(chartY(102, scale)).toBeLessThan(chartY(100, scale));
        const path = lineChartPath(points, [0, 100], scale);
        expect(path.startsWith('M ')).toBe(true);
        expect(path).toContain(' L ');
    });

    it('draws candle bodies between open and close and wicks between high and low', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100, { open: 100, close: 100, high: 110, low: 90 }),
            point('2026-01-05T10:30:00.000Z', 100, { open: 98, close: 102, high: 104, low: 96 }),
        ];
        const scale = historyPriceScale(points, 'candlestick');
        const geometry = candleGeometries(points, [0, 100], scale);

        expect(geometry[0]?.direction).toBe('flat');
        expect(geometry[0]?.highY).toBeLessThan(geometry[0]?.lowY ?? 0);
        expect(geometry[1]?.direction).toBe('up');
        expect(geometry[1]?.bodyHeight).toBeGreaterThan(1);
        expect(geometry[1]?.bodyY).toBeLessThan(geometry[1]?.bodyY + geometry[1]!.bodyHeight);
        expect(geometry[1]?.bodyWidth).toBeGreaterThan(0);
    });

    it('enforces a minimum visible body height and centers it on the price level', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 100, { open: 100, close: 100, high: 110, low: 90 }),
        ];
        const scale = historyPriceScale(points, 'candlestick');
        const [geometry] = candleGeometries(points, [50], scale, 4);

        expect(geometry?.bodyHeight).toBe(4);
        expect(geometry?.bodyY).toBeCloseTo(chartY(100, scale) - 2, 5);
    });

    it('keeps bodies larger than the minimum anchored between open and close', () => {
        const points = [
            point('2026-01-05T09:30:00.000Z', 105, { open: 100, close: 110, high: 115, low: 95 }),
        ];
        const scale = historyPriceScale(points, 'candlestick');
        const [geometry] = candleGeometries(points, [50], scale, 4);
        const openY = chartY(100, scale);
        const closeY = chartY(110, scale);

        expect(geometry?.bodyHeight).toBeCloseTo(Math.abs(openY - closeY), 5);
        expect(geometry?.bodyY).toBe(Math.min(openY, closeY));
    });
});
