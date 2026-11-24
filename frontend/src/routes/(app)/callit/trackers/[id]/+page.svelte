<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import PageHeading from '$lib/components/PageHeading.svelte';
    import PredictionCard from '$lib/components/callit/PredictionCard.svelte';
    import PriceHistoryChart from '$lib/components/callit/PriceHistoryChart.svelte';
    import Discussion from '$lib/components/Discussion.svelte';
    import { formatDateTime, formatTrackerPrice, historyRangeLabel } from '$lib/components/callit/format';
    import type { CallItTrackerDetail } from '$lib/components/callit/types';
    import { setPageTitle } from '$lib/utils';

    const gateway = getGatewayManager();
    const trackerId = $derived(page.params.id ?? '');
    // Keep the largest range in sync with CALL_IT_MAX_HISTORY_DAYS on the backend.
    const historyRanges = [1, 7, 30, 90, 365, 1825] as const;
    let historyDays = $state<number>(30);
    let data = $state<CallItTrackerDetail | null>(null);
    let commentCount = $state(0);
    let loading = $state(true);
    let historyLoading = $state(false);
    let historyRequestId = 0;
    let errorMessage = $state<string | null>(null);

    async function load() {
        const requestId = ++historyRequestId;
        try {
            const response = await api.callit.trackers({ id: trackerId }).get({ query: { historyDays } });
            if (requestId !== historyRequestId) return;
            if (response.error || !response.data) throw new Error('load failed');
            data = response.data;
            commentCount = data.commentCount;
            errorMessage = null;
        } catch {
            if (requestId !== historyRequestId) return;
            errorMessage = 'Der Tracker konnte nicht geladen werden.';
        } finally {
            if (requestId === historyRequestId) {
                loading = false;
                historyLoading = false;
            }
        }
    }

    async function setRange(days: number) {
        if (historyDays === days) return;
        historyDays = days;
        historyLoading = true;
        await load();
    }

    onMount(() => {
        setPageTitle('Call it');
        const unsubscribeTracker = gateway.onEvent('callit.tracker.changed', (event) => {
            if (event.entityId === trackerId) void load();
        });
        const unsubscribePrediction = gateway.onEvent('callit.prediction.changed', () => void load());
        const unsubscribeReaction = gateway.onEvent('reaction.changed', (event) => {
            if (event.entityId.startsWith('callit.prediction:')) void load();
        });
        const unsubscribeDiscussion = gateway.onEvent('discussion.changed', (event) => {
            if (data?.tracker.discussionId !== event.entityId) return;
            if (event.action === 'CREATED') commentCount += 1;
            else if (event.action === 'DELETED') commentCount = Math.max(0, commentCount - 1);
        });
        const unsubscribeConnected = gateway.onConnected(() => void load());
        void load();
        return () => {
            unsubscribeTracker();
            unsubscribePrediction();
            unsubscribeReaction();
            unsubscribeDiscussion();
            unsubscribeConnected();
        };
    });
</script>

<svelte:head>
    <title>Tracker - Call it - Gnag Home</title>
    <meta name="description" content="Kursverlauf und Vorhersagen zu einem Call-it-Tracker." />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
        <PageHeading title={data ? `${data.tracker.symbol}` : 'Tracker'} subtitle={data?.tracker.name ?? 'Kursverlauf und Vorhersagen'} />
        <div class="flex flex-wrap gap-2">
            <a href="/callit" class="btn preset-outlined shrink-0">Zurück</a>
            {#if data?.tracker.isActive}
                <a href={`/callit/create?tracker=${encodeURIComponent(data.tracker.id)}`} class="btn preset-filled shrink-0">Vorhersage für {data.tracker.symbol}</a>
            {/if}
        </div>
    </header>

    {#if loading}
        <p class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-12 text-center text-surface-600-400" role="status">
            Tracker wird geladen …
        </p>
    {:else if errorMessage}
        <div class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-8 text-center" role="alert">
            <p class="text-sm text-error-700-300">{errorMessage}</p>
            <button type="button" class="btn preset-outlined mt-3 enabled:cursor-pointer" onclick={() => void load()}>Erneut versuchen</button>
        </div>
    {:else if data}
        <section class="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 p-4" aria-label="Tracker-Übersicht">
            <div>
                <p class="text-xs uppercase tracking-wide text-surface-600-400">Aktueller Kurs</p>
                <p class="text-2xl font-bold text-surface-950-50">{formatTrackerPrice(data.tracker.lastPrice, data.tracker.currency)}</p>
                <p class="text-xs text-surface-600-400">Aktualisiert: {data.tracker.lastPriceAt ? formatDateTime(data.tracker.lastPriceAt) : 'noch nie'}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-sm text-surface-600-400">
                {#if !data.tracker.isActive}
                    <span class="rounded-full bg-surface-300-700 px-2.5 py-1 text-xs font-semibold text-surface-contrast-300-700">Entfernt</span>
                {/if}
                <span>{commentCount} {commentCount === 1 ? 'Kommentar' : 'Kommentare'}</span>
                <span>· {data.activePredictions.length} laufende Vorhersagen</span>
            </div>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-tracker-history-heading">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="callit-tracker-history-heading" class="text-lg font-semibold text-surface-950-50">Kursverlauf</h2>
                <div class="flex flex-wrap gap-1">
                    {#each historyRanges as range (range)}
                        <button
                            type="button"
                            aria-pressed={historyDays === range}
                            class="rounded-md px-2.5 py-1 text-sm transition-colors enabled:cursor-pointer {historyDays === range ? 'bg-primary-500 text-primary-contrast-500' : 'text-surface-600-400 hover:bg-surface-100-900'}"
                            onclick={() => void setRange(range)}
                        >
                            {historyRangeLabel(range)}
                        </button>
                    {/each}
                </div>
            </div>
            {#if historyLoading}
                <p class="text-xs text-surface-600-400" role="status">Verlauf wird geladen …</p>
            {/if}
            <PriceHistoryChart points={data.history} currency={data.tracker.currency} />
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-tracker-active-heading">
            <div class="flex items-baseline justify-between gap-3">
                <h2 id="callit-tracker-active-heading" class="text-lg font-semibold text-surface-950-50">Laufende Vorhersagen</h2>
                <span class="text-xs text-surface-600-400">{data.activePredictions.length}</span>
            </div>
            {#if data.activePredictions.length === 0}
                <p class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center text-sm text-surface-600-400">
                    Keine laufenden Vorhersagen für diesen Tracker.
                </p>
            {:else}
                {#each data.activePredictions as prediction (prediction.id)}
                    <PredictionCard {prediction} />
                {/each}
            {/if}
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-tracker-completed-heading">
            <div class="flex items-baseline justify-between gap-3">
                <h2 id="callit-tracker-completed-heading" class="text-lg font-semibold text-surface-950-50">Abgeschlossene Vorhersagen</h2>
                <span class="text-xs text-surface-600-400">{data.completedPredictions.length}</span>
            </div>
            {#if data.completedPredictions.length === 0}
                <p class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center text-sm text-surface-600-400">
                    Noch keine abgeschlossenen Vorhersagen für diesen Tracker.
                </p>
            {:else}
                {#each data.completedPredictions as prediction (prediction.id)}
                    <PredictionCard {prediction} />
                {/each}
            {/if}
        </section>

        {#if data.tracker.discussionId}
            <Discussion discussionId={data.tracker.discussionId} />
        {/if}
    {/if}
</main>

