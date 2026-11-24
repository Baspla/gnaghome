<script lang="ts">
    import PriceHistoryChart from './PriceHistoryChart.svelte';
    import type { CallItTrackerOverviewItem } from './types';
    import { formatDateTime, formatTrackerPrice } from './format';

    type Props = { tracker: CallItTrackerOverviewItem };

    let { tracker }: Props = $props();
</script>

<article class="flex flex-col gap-3 rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 p-4 shadow-sm">
    <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
            <a
                href={`/callit/trackers/${encodeURIComponent(tracker.id)}`}
                class="block truncate text-lg font-bold text-surface-950-50 underline-offset-2 hover:underline"
            >
                {tracker.symbol}
            </a>
            <p class="truncate text-sm text-surface-600-400">{tracker.name}</p>
        </div>
        <div class="text-right">
            <p class="font-semibold text-surface-950-50">{formatTrackerPrice(tracker.lastPrice, tracker.currency)}</p>
            <p class="text-xs text-surface-600-400">{tracker.activePredictionCount} laufend</p>
        </div>
    </div>

    <PriceHistoryChart points={tracker.history} currency={tracker.currency} height={110} />

    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-surface-600-400">
        <span>{tracker.lastPriceAt ? `Aktualisiert: ${formatDateTime(tracker.lastPriceAt)}` : 'Noch nicht aktualisiert'}</span>
        <a href={`/callit/trackers/${encodeURIComponent(tracker.id)}`} class="font-semibold text-primary-700-300 underline-offset-2 hover:underline">
            Tracker öffnen
        </a>
    </div>
</article>
