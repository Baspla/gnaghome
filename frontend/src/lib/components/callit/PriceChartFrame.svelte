<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { CallItHistoryPoint } from './types';
    import {
        CHART_MAX_POINTS,
        CHART_PADDING,
        CHART_VIEW_HEIGHT,
        CHART_VIEW_WIDTH,
        candleChartPercents,
        chartY,
        historyChartPercents,
        historyPriceScale,
        sampleHistory,
        type ChartPointMode,
        type HistoryPriceScale,
    } from './history';
    import { formatDate, formatTrackerPrice } from './format';

    type ChartSeriesContext = {
        sampled: CallItHistoryPoint[];
        xPercent: number[];
        scale: HistoryPriceScale;
    };

    type Props = {
        points: CallItHistoryPoint[];
        currency: string | null;
        height?: number;
        mode: ChartPointMode;
        series: Snippet<[ChartSeriesContext]>;
    };

    let { points, currency, height = 220, mode, series }: Props = $props();

    const sampled = $derived(sampleHistory(points, CHART_MAX_POINTS));
    const xPercent = $derived(mode === 'candlestick'
        ? candleChartPercents(sampled)
        : historyChartPercents(sampled));
    const scale = $derived(historyPriceScale(sampled, mode));
    const firstPoint = $derived(sampled[0] ?? null);
    const lastPoint = $derived(sampled[sampled.length - 1] ?? null);
    const currentYPercent = $derived.by(() => {
        if (!lastPoint) return 50;
        const y = chartY(lastPoint.close, scale);
        return Math.min(95, Math.max(5, (y / CHART_VIEW_HEIGHT) * 100));
    });
    const ariaLabel = $derived.by(() => {
        if (!firstPoint || !lastPoint) return 'Kursverlauf';
        const prefix = mode === 'candlestick' ? 'Candlestick-Kursverlauf' : 'Kursverlauf';
        const currentLabel = mode === 'candlestick' ? 'letzter Schlusskurs' : 'aktueller Kurs';
        return `${prefix} von ${formatTrackerPrice(firstPoint.close, currency)} am ${formatDate(firstPoint.observedAt)} bis ${formatTrackerPrice(lastPoint.close, currency)} am ${formatDate(lastPoint.observedAt)}. Höchstkurs ${formatTrackerPrice(scale.maxPrice, currency)}, Tiefstkurs ${formatTrackerPrice(scale.minPrice, currency)}, ${currentLabel} ${formatTrackerPrice(lastPoint.close, currency)}.`;
    });
    const summary = $derived.by(() => {
        if (!firstPoint || !lastPoint) return '';
        if (mode === 'candlestick') {
            return `${sampled.length} Kerzen. Erster Eröffnungskurs ${formatTrackerPrice(firstPoint.open, currency)}, letzter Schlusskurs ${formatTrackerPrice(lastPoint.close, currency)}, Höchstkurs ${formatTrackerPrice(scale.maxPrice, currency)}, Tiefstkurs ${formatTrackerPrice(scale.minPrice, currency)}.`;
        }
        return `${sampled.length} Kurspunkte. Höchstkurs ${formatTrackerPrice(scale.maxPrice, currency)}, Tiefstkurs ${formatTrackerPrice(scale.minPrice, currency)}, erster Kurs ${formatTrackerPrice(firstPoint.close, currency)}, letzter Kurs ${formatTrackerPrice(lastPoint.close, currency)}.`;
    });
</script>

{#if sampled.length < 2}
    <div class="flex h-48 items-center justify-center rounded-xl border border-dashed border-surface-300-700/60 text-sm text-surface-600-400" role="status">
        Noch nicht genug Kursdaten für einen Verlauf.
    </div>
{:else}
    <div class="rounded-xl border border-surface-300-700/40 bg-surface-50-950/40 p-3">
        <div class="relative" style:height={`${height}px`}>
            <div class="absolute inset-y-0 left-0 right-16">
                <svg
                    viewBox={`0 0 ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT}`}
                    preserveAspectRatio="none"
                    class="h-full w-full"
                    role="img"
                    aria-label={ariaLabel}
                >
                    <line
                        x1={CHART_PADDING}
                        y1={CHART_PADDING}
                        x2={CHART_VIEW_WIDTH - CHART_PADDING}
                        y2={CHART_PADDING}
                        class="stroke-surface-300-700/30"
                        stroke-width="1"
                        vector-effect="non-scaling-stroke"
                    />
                    <line
                        x1={CHART_PADDING}
                        y1={CHART_VIEW_HEIGHT / 2}
                        x2={CHART_VIEW_WIDTH - CHART_PADDING}
                        y2={CHART_VIEW_HEIGHT / 2}
                        class="stroke-surface-300-700/30"
                        stroke-width="1"
                        vector-effect="non-scaling-stroke"
                    />
                    <line
                        x1={CHART_PADDING}
                        y1={CHART_VIEW_HEIGHT - CHART_PADDING}
                        x2={CHART_VIEW_WIDTH - CHART_PADDING}
                        y2={CHART_VIEW_HEIGHT - CHART_PADDING}
                        class="stroke-surface-300-700/30"
                        stroke-width="1"
                        vector-effect="non-scaling-stroke"
                    />
                    {@render series({ sampled, xPercent, scale })}
                </svg>
            </div>

            <div class="pointer-events-none absolute inset-y-0 right-0 flex w-16 flex-col justify-between py-0.5 text-right text-[10px] font-medium text-surface-600-400">
                <span class="whitespace-nowrap rounded bg-surface-50-950/90 px-1 py-0.5" title="Höchstkurs">
                    {formatTrackerPrice(scale.maxPrice, currency)}
                </span>
                <span class="whitespace-nowrap rounded bg-surface-50-950/90 px-1 py-0.5" title="Tiefstkurs">
                    {formatTrackerPrice(scale.minPrice, currency)}
                </span>
            </div>

            <div
                class="pointer-events-none absolute right-0 w-16 -translate-y-1/2 text-right"
                style:top={`${currentYPercent}%`}
            >
                <span class="whitespace-nowrap rounded bg-primary-500 px-1 py-0.5 text-[10px] font-semibold text-primary-contrast-500 shadow-sm" title="Aktueller Kurs">
                    {formatTrackerPrice(lastPoint?.close ?? null, currency)}
                </span>
            </div>
        </div>

        <div class="mt-2 flex justify-between gap-3 pr-16 text-xs text-surface-600-400">
            <span>{firstPoint ? formatDate(firstPoint.observedAt) : ''}</span>
            <span>{lastPoint ? formatDate(lastPoint.observedAt) : ''}</span>
        </div>
        <p class="sr-only">{summary}</p>
    </div>
{/if}
