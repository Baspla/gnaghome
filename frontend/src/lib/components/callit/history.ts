import type { CallItHistoryPoint } from './types';

/** Shared SVG coordinate space for all Call-it price charts. */
export const CHART_VIEW_WIDTH = 1000;
export const CHART_VIEW_HEIGHT = 300;
export const CHART_PADDING = 12;
export const CHART_MAX_POINTS = 500;

export type ChartPointMode = 'line' | 'candlestick';

export type HistoryPriceScale = {
    minPrice: number;
    maxPrice: number;
    range: number;
    paddedMin: number;
};

export type CandleDirection = 'up' | 'down' | 'flat';

export type CandleGeometry = {
    observedAt: string;
    centerX: number;
    bodyX: number;
    bodyY: number;
    bodyWidth: number;
    bodyHeight: number;
    highY: number;
    lowY: number;
    direction: CandleDirection;
};

/** Long flat runs (overnight/weekend/closed markets) are compressed for chart display. */
export const FLAT_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000;

function sameCandle(a: CallItHistoryPoint, b: CallItHistoryPoint): boolean {
    return a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close;
}

type HistoryEntry = { inputIndex: number; time: number };

function orderedHistoryEntries(points: CallItHistoryPoint[]): HistoryEntry[] {
    return points
        .map((point, inputIndex) => ({ inputIndex, time: new Date(point.observedAt).getTime() }))
        .sort((a, b) => a.time - b.time);
}

function groupHistorySessions(entries: HistoryEntry[], sessionGapMs: number): HistoryEntry[][] {
    const sessions: HistoryEntry[][] = [];
    for (const entry of entries) {
        const current = sessions[sessions.length - 1];
        if (!current || entry.time - current[current.length - 1]!.time > sessionGapMs) {
            sessions.push([entry]);
        } else {
            current.push(entry);
        }
    }
    return sessions;
}

/**
 * Returns each point's horizontal chart position as a percentage of the
 * trading-session timeline. Points separated by more than `sessionGapMs` start
 * a new session, so nights, weekends and holidays take no horizontal space and
 * consecutive sessions join at their boundary. Every session gets an equal
 * width; inside a session, points keep their relative time position.
 */
export function historyChartPercents(
    points: CallItHistoryPoint[],
    sessionGapMs = FLAT_RUN_THRESHOLD_MS,
): number[] {
    if (points.length === 0) return [];

    const ordered = orderedHistoryEntries(points);
    if (ordered.some((entry) => !Number.isFinite(entry.time))) {
        return points.map((_, index) => (index / Math.max(1, points.length - 1)) * 100);
    }

    const sessions = groupHistorySessions(ordered, sessionGapMs);
    const percents = new Array<number>(points.length).fill(0);
    sessions.forEach((session, sessionIndex) => {
        const first = session[0]!;
        const last = session[session.length - 1]!;
        const span = last.time - first.time;
        for (const entry of session) {
            // Single-point sessions sit in the middle of their slot so a daily
            // series does not end up flush against the chart edges.
            const fraction = span > 0 ? (entry.time - first.time) / span : 0.5;
            percents[entry.inputIndex] = ((sessionIndex + fraction) / sessions.length) * 100;
        }
    });

    return percents;
}

/**
 * Candlestick positions. Every candle gets its own slot inside a session and
 * session edges are inset by half a slot, so the last candle of one session and
 * the first candle of the next never share the same x position. Within a
 * session, relative time still determines the spacing between candles.
 */
export function candleChartPercents(
    points: CallItHistoryPoint[],
    sessionGapMs = FLAT_RUN_THRESHOLD_MS,
): number[] {
    if (points.length === 0) return [];

    const ordered = orderedHistoryEntries(points);
    if (ordered.some((entry) => !Number.isFinite(entry.time))) {
        return points.map((_, index) => ((index + 0.5) / points.length) * 100);
    }

    const sessions = groupHistorySessions(ordered, sessionGapMs);
    const percents = new Array<number>(points.length).fill(0);
    sessions.forEach((session, sessionIndex) => {
        const first = session[0]!;
        const last = session[session.length - 1]!;
        const span = last.time - first.time;
        session.forEach((entry, index) => {
            const timeFraction = session.length === 1
                ? 0.5
                : span > 0
                    ? (entry.time - first.time) / span
                    : index / (session.length - 1);
            const fraction = session.length === 1
                ? 0.5
                : (0.5 + timeFraction * (session.length - 1)) / session.length;
            percents[entry.inputIndex] = ((sessionIndex + fraction) / sessions.length) * 100;
        });
    });

    return percents;
}

export function compactFlatHistory(
    points: CallItHistoryPoint[],
    thresholdMs = FLAT_RUN_THRESHOLD_MS,
): CallItHistoryPoint[] {
    if (points.length < 2) return points;

    const sorted = [...points].sort(
        (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
    );
    const result: CallItHistoryPoint[] = [];
    let index = 0;

    while (index < sorted.length) {
        const start = sorted[index]!;
        let end = index;
        while (end + 1 < sorted.length && sameCandle(sorted[end + 1]!, start)) {
            end += 1;
        }

        // Keep the first point of every run. For a long flat run, drop the
        // remaining points so the chart connects directly to the next move.
        result.push(start);
        const span = new Date(sorted[end]!.observedAt).getTime() - new Date(start.observedAt).getTime();
        if (span <= thresholdMs) {
            for (let cursor = index + 1; cursor <= end; cursor += 1) {
                result.push(sorted[cursor]!);
            }
        }
        index = end + 1;
    }

    return result;
}

/** Compacts closed-market runs and caps the number of rendered points. */
export function sampleHistory(
    points: CallItHistoryPoint[],
    maxPoints = CHART_MAX_POINTS,
): CallItHistoryPoint[] {
    const compacted = compactFlatHistory(points);
    if (compacted.length <= maxPoints) return compacted;
    const step = (compacted.length - 1) / (maxPoints - 1);
    return Array.from({ length: maxPoints }, (_, index) => compacted[Math.round(index * step)]!);
}

/**
 * Shared vertical scale. Line charts scale by close; candlestick charts include
 * the full high/low range so wicks never leave the chart.
 */
export function historyPriceScale(
    points: CallItHistoryPoint[],
    mode: ChartPointMode = 'line',
): HistoryPriceScale {
    const values = (mode === 'candlestick'
        ? points.flatMap((point) => [point.high, point.low, point.open, point.close])
        : points.map((point) => point.close)
    ).filter((value) => Number.isFinite(value));
    if (values.length === 0) {
        return { minPrice: 0, maxPrice: 0, range: 0.0001, paddedMin: 0 };
    }

    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const range = Math.max(maxPrice - minPrice, maxPrice * 0.005, 0.0001);
    const paddedMin = minPrice - (range - (maxPrice - minPrice)) / 2;
    return { minPrice, maxPrice, range, paddedMin };
}

export function chartX(percent: number): number {
    return CHART_PADDING + (percent / 100) * (CHART_VIEW_WIDTH - CHART_PADDING * 2);
}

export function chartY(price: number, scale: HistoryPriceScale): number {
    return CHART_VIEW_HEIGHT - CHART_PADDING
        - ((price - scale.paddedMin) / scale.range) * (CHART_VIEW_HEIGHT - CHART_PADDING * 2);
}

export function lineChartPath(
    points: CallItHistoryPoint[],
    xPercent: number[],
    scale: HistoryPriceScale,
): string {
    if (points.length < 2) return '';
    return points.map((point, index) => {
        const x = chartX(xPercent[index] ?? 0);
        const y = chartY(point.close, scale);
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
}

export function candleGeometries(
    points: CallItHistoryPoint[],
    xPercent: number[],
    scale: HistoryPriceScale,
    minBodyHeight = 1,
): CandleGeometry[] {
    if (points.length === 0) return [];
    const minimumBodyHeight = Math.max(1, minBodyHeight);
    const centers = xPercent.map(chartX);
    const widths = centers.map((x, index) => {
        const previous = centers[index - 1] ?? x - ((centers[index + 1] ?? x) - x);
        const next = centers[index + 1] ?? x + (x - (centers[index - 1] ?? x));
        const gap = Math.min(Math.abs(x - previous), Math.abs(next - x));
        return Math.max(1, Math.min(14, gap * 0.6));
    });

    return points.map((point, index) => {
        const centerX = centers[index]!;
        const bodyWidth = widths[index]!;
        const openY = chartY(point.open, scale);
        const closeY = chartY(point.close, scale);
        const rawBodyHeight = Math.abs(openY - closeY);
        const bodyHeight = Math.max(rawBodyHeight, minimumBodyHeight);
        const bodyY = rawBodyHeight >= minimumBodyHeight
            ? Math.min(openY, closeY)
            : (openY + closeY) / 2 - bodyHeight / 2;
        return {
            observedAt: point.observedAt,
            centerX,
            bodyX: centerX - bodyWidth / 2,
            bodyY,
            bodyWidth,
            bodyHeight,
            highY: chartY(point.high, scale),
            lowY: chartY(point.low, scale),
            direction: point.close > point.open ? 'up' : point.close < point.open ? 'down' : 'flat',
        };
    });
}
