<script lang="ts">
    import type { CallItHistoryPoint } from './types';
    import { formatDate, formatTrackerPrice } from './format';
    import { compactFlatHistory, historyPointPercent } from './history';

    type Props = {
        points: CallItHistoryPoint[];
        currency: string | null;
        height?: number;
    };

    let { points, currency, height = 220 }: Props = $props();

    const maxPoints = 500;
    const sampled = $derived.by(() => {
        const compacted = compactFlatHistory(points);
        if (compacted.length <= maxPoints) return compacted;
        const step = (compacted.length - 1) / (maxPoints - 1);
        return Array.from({ length: maxPoints }, (_, index) => compacted[Math.round(index * step)]!);
    });
    const prices = $derived(sampled.map((point) => point.price).filter((price) => Number.isFinite(price)));
    const minPrice = $derived(prices.length > 0 ? Math.min(...prices) : 0);
    const maxPrice = $derived(prices.length > 0 ? Math.max(...prices) : 0);
    const range = $derived(Math.max(maxPrice - minPrice, maxPrice * 0.005, 0.0001));
    const paddedMin = $derived(minPrice - (range - (maxPrice - minPrice)) / 2);
    const firstPoint = $derived(sampled[0] ?? null);
    const lastPoint = $derived(sampled[sampled.length - 1] ?? null);
    // Long ranges mix daily history with recent intraday points, so X must be
    // based on timestamps rather than point index.
    const chartPath = $derived.by(() => {
        if (sampled.length < 2 || !firstPoint || !lastPoint) return '';
        const width = 1000;
        const chartHeight = 300;
        const padding = 12;
        return sampled.map((point, index) => {
            const xPercent = historyPointPercent(point.observedAt, firstPoint.observedAt, lastPoint.observedAt);
            const x = padding + (xPercent / 100) * (width - padding * 2);
            const y = chartHeight - padding - ((point.price - paddedMin) / range) * (chartHeight - padding * 2);
            return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
        }).join(' ');
    });
    const currentYPercent = $derived.by(() => {
        if (!lastPoint) return 50;
        const chartHeight = 300;
        const padding = 12;
        const y = chartHeight - padding - ((lastPoint.price - paddedMin) / range) * (chartHeight - padding * 2);
        return Math.min(95, Math.max(5, (y / chartHeight) * 100));
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
                    viewBox="0 0 1000 300"
                    preserveAspectRatio="none"
                    class="h-full w-full"
                    role="img"
                    aria-label={`Kursverlauf von ${formatTrackerPrice(firstPoint?.price ?? null, currency)} am ${firstPoint ? formatDate(firstPoint.observedAt) : ''} bis ${formatTrackerPrice(lastPoint?.price ?? null, currency)} am ${lastPoint ? formatDate(lastPoint.observedAt) : ''}. Höchstkurs ${formatTrackerPrice(maxPrice, currency)}, Tiefstkurs ${formatTrackerPrice(minPrice, currency)}, aktueller Kurs ${formatTrackerPrice(lastPoint?.price ?? null, currency)}.`}
                >
                    <line x1="12" y1="12" x2="988" y2="12" class="stroke-surface-300-700/30" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line x1="12" y1="150" x2="988" y2="150" class="stroke-surface-300-700/30" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line x1="12" y1="288" x2="988" y2="288" class="stroke-surface-300-700/30" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <path d={chartPath} fill="none" class="stroke-primary-500" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                </svg>
            </div>

            <div class="pointer-events-none absolute inset-y-0 right-0 flex w-16 flex-col justify-between py-0.5 text-right text-[10px] font-medium text-surface-600-400">
                <span class="whitespace-nowrap rounded bg-surface-50-950/90 px-1 py-0.5" title="Höchstkurs">
                    {formatTrackerPrice(maxPrice, currency)}
                </span>
                <span class="whitespace-nowrap rounded bg-surface-50-950/90 px-1 py-0.5" title="Tiefstkurs">
                    {formatTrackerPrice(minPrice, currency)}
                </span>
            </div>

            <div
                class="pointer-events-none absolute right-0 w-16 -translate-y-1/2 text-right"
                style:top={`${currentYPercent}%`}
            >
                <span class="whitespace-nowrap rounded bg-primary-500 px-1 py-0.5 text-[10px] font-semibold text-primary-contrast-500 shadow-sm" title="Aktueller Kurs">
                    {formatTrackerPrice(lastPoint?.price ?? null, currency)}
                </span>
            </div>
        </div>

        <div class="mt-2 flex justify-between gap-3 pr-16 text-xs text-surface-600-400">
            <span>{firstPoint ? formatDate(firstPoint.observedAt) : ''}</span>
            <span>{lastPoint ? formatDate(lastPoint.observedAt) : ''}</span>
        </div>
        <p class="sr-only">
            {sampled.length} Kurspunkte. Höchstkurs {formatTrackerPrice(maxPrice, currency)}, Tiefstkurs {formatTrackerPrice(minPrice, currency)}, erster Kurs {formatTrackerPrice(firstPoint?.price ?? null, currency)}, letzter Kurs {formatTrackerPrice(lastPoint?.price ?? null, currency)}.
        </p>
    </div>
{/if}
