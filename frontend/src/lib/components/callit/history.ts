import type { CallItHistoryPoint } from './types';

/** Long flat runs (overnight/weekend/closed markets) are compressed for chart display. */
export const FLAT_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/** Returns a point's horizontal chart position as a percentage of the time range. */
export function historyPointPercent(
    observedAt: string,
    firstObservedAt: string,
    lastObservedAt: string,
): number {
    const pointTime = new Date(observedAt).getTime();
    const firstTime = new Date(firstObservedAt).getTime();
    const lastTime = new Date(lastObservedAt).getTime();
    const span = lastTime - firstTime;
    if (!Number.isFinite(pointTime) || !Number.isFinite(firstTime) || !Number.isFinite(lastTime) || span <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, ((pointTime - firstTime) / span) * 100));
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
        while (end + 1 < sorted.length && sorted[end + 1]!.price === start.price) {
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
