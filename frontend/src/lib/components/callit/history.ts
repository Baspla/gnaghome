import type { CallItHistoryPoint } from './types';

/** Long flat runs (overnight/weekend/closed markets) are compressed for chart display. */
export const FLAT_RUN_THRESHOLD_MS = 2 * 60 * 60 * 1000;

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

    const ordered = points
        .map((point, inputIndex) => ({ inputIndex, time: new Date(point.observedAt).getTime() }))
        .sort((a, b) => a.time - b.time);

    if (ordered.some((entry) => !Number.isFinite(entry.time))) {
        return points.map((_, index) => (index / Math.max(1, points.length - 1)) * 100);
    }

    const sessions: Array<Array<{ inputIndex: number; time: number }>> = [];
    for (const entry of ordered) {
        const current = sessions[sessions.length - 1];
        if (!current || entry.time - current[current.length - 1]!.time > sessionGapMs) {
            sessions.push([entry]);
        } else {
            current.push(entry);
        }
    }

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
