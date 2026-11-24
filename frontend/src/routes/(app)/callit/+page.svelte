<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import PageHeading from '$lib/components/PageHeading.svelte';
    import PredictionCard from '$lib/components/callit/PredictionCard.svelte';
    import Leaderboard from '$lib/components/callit/Leaderboard.svelte';
    import TrackerOverviewCard from '$lib/components/callit/TrackerOverviewCard.svelte';
    import { formatEuroPoints } from '$lib/components/callit/format';
    import type { CallItOverview, CallItTrackerOverviewItem } from '$lib/components/callit/types';
    import { setPageTitle } from '$lib/utils';

    const gateway = getGatewayManager();
    const currentUserId = $derived(page.data.user?.id ?? '');
    let overview = $state<CallItOverview | null>(null);
    let trackers = $state<CallItTrackerOverviewItem[]>([]);
    let loading = $state(true);
    let errorMessage = $state<string | null>(null);
    let trackersLoading = $state(true);
    let trackersError = $state<string | null>(null);

    async function loadOverview() {
        try {
            const response = await api.callit.overview.get();
            if (response.error || !response.data) throw new Error('load failed');
            overview = response.data;
            errorMessage = null;
        } catch {
            errorMessage = 'Call it konnte nicht geladen werden. Bitte versuche es erneut.';
        } finally {
            loading = false;
        }
    }

    async function loadTrackers() {
        try {
            const response = await api.callit.trackers.overview.get({ query: { historyDays: 7 } });
            if (response.error || !response.data) throw new Error('load failed');
            trackers = response.data.items;
            trackersError = null;
        } catch {
            trackersError = 'Tracker konnten nicht geladen werden.';
        } finally {
            trackersLoading = false;
        }
    }

    function loadAll() {
        void loadOverview();
        void loadTrackers();
    }

    onMount(() => {
        setPageTitle('Call it');
        const unsubscribePrediction = gateway.onEvent('callit.prediction.changed', loadAll);
        const unsubscribeStats = gateway.onEvent('callit.user-stats.changed', () => void loadOverview());
        const unsubscribeTracker = gateway.onEvent('callit.tracker.changed', loadAll);
        const unsubscribeSettings = gateway.onEvent('callit.settings.changed', () => void loadOverview());
        const unsubscribeReaction = gateway.onEvent('reaction.changed', (event) => {
            if (event.entityId.startsWith('callit.prediction:')) void loadOverview();
        });
        const unsubscribeConnected = gateway.onConnected(loadAll);
        loadAll();
        return () => {
            unsubscribePrediction();
            unsubscribeStats();
            unsubscribeTracker();
            unsubscribeSettings();
            unsubscribeReaction();
            unsubscribeConnected();
        };
    });
</script>

<svelte:head>
    <title>Call it - Gnag Home</title>
    <meta name="description" content="Vorhersagen auf Kurse mit der Gruppe." />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
        <PageHeading title="Call it" subtitle="Vorhersagen auf die Richtung von Kursen." />
        <a href="/callit/create" class="btn preset-filled shrink-0">Neue Vorhersage</a>
    </header>

    {#if loading}
        <p class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-12 text-center text-surface-600-400" role="status">
            Call it wird geladen …
        </p>
    {:else if errorMessage}
        <div class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-8 text-center" role="alert">
            <p class="text-sm text-error-700-300">{errorMessage}</p>
            <button type="button" class="btn preset-outlined mt-3 enabled:cursor-pointer" onclick={() => void loadOverview()}>Erneut versuchen</button>
        </div>
    {:else if overview}
        <section class="grid grid-cols-2 gap-3 rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 p-4 sm:grid-cols-4" aria-label="Deine Call-it-Statistik">
            <div>
                <p class="text-xs text-surface-600-400">Laufende Vorhersagen</p>
                <p class="text-xl font-bold text-surface-950-50">{overview.myStats.activePredictionCount} / {overview.limits.maxActivePredictionsPerUser}</p>
            </div>
            <div>
                <p class="text-xs text-surface-600-400">Aktiver Einsatz</p>
                <p class="text-xl font-bold text-surface-950-50">{formatEuroPoints(overview.myStats.activeWagerTotal)}</p>
            </div>
            <div>
                <p class="text-xs text-surface-600-400">Allzeit-Gewinn</p>
                <p class="text-xl font-bold {overview.myStats.allTimeProfit > 0 ? 'text-success-700-300' : overview.myStats.allTimeProfit < 0 ? 'text-error-700-300' : 'text-surface-950-50'}">
                    {formatEuroPoints(overview.myStats.allTimeProfit, true)}
                </p>
            </div>
            <div>
                <p class="text-xs text-surface-600-400">Abgeschlossen</p>
                <p class="text-xl font-bold text-surface-950-50">{overview.myStats.completedCount}</p>
            </div>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-my-predictions-heading">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="callit-my-predictions-heading" class="text-lg font-semibold text-surface-950-50">Deine laufenden Vorhersagen</h2>
                <div class="flex items-center gap-3">
                    <span class="text-xs text-surface-600-400">{overview.myActivePredictions.length}</span>
                    <a href={`/callit/users/${encodeURIComponent(currentUserId)}`} class="text-sm font-semibold text-primary-700-300 underline-offset-2 hover:underline">
                        Alle meine Vorhersagen
                    </a>
                </div>
            </div>
            {#if overview.myActivePredictions.length === 0}
                <div class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center">
                    <p class="text-sm text-surface-600-400">Du hast noch keine laufende Vorhersage.</p>
                    <a href="/callit/create" class="btn preset-filled mt-3">Erste Vorhersage platzieren</a>
                </div>
            {:else}
                {#each overview.myActivePredictions as prediction (prediction.id)}
                    <PredictionCard {prediction} showUser={false} />
                {/each}
            {/if}
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-group-predictions-heading">
            <div class="flex items-baseline justify-between gap-3">
                <h2 id="callit-group-predictions-heading" class="text-lg font-semibold text-surface-950-50">Laufende Vorhersagen der Gruppe</h2>
                <span class="text-xs text-surface-600-400">{overview.otherActivePredictions.length}</span>
            </div>
            {#if overview.otherActivePredictions.length === 0}
                <p class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center text-sm text-surface-600-400">
                    Aktuell laufen keine anderen Vorhersagen.
                </p>
            {:else}
                {#each overview.otherActivePredictions as prediction (prediction.id)}
                    <PredictionCard {prediction} />
                {/each}
            {/if}
        </section>

        <Leaderboard entries={overview.leaderboard} {currentUserId} />

        <section class="flex flex-col gap-3" aria-labelledby="callit-trackers-heading">
            <div class="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="callit-trackers-heading" class="text-lg font-semibold text-surface-950-50">Tracker</h2>
                <span class="text-xs text-surface-600-400">Kursverlauf der letzten 7 Tage</span>
            </div>
            {#if trackersLoading}
                <p class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-5 py-8 text-center text-sm text-surface-600-400" role="status">
                    Tracker werden geladen …
                </p>
            {:else if trackersError}
                <div class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-5 py-6 text-center" role="alert">
                    <p class="text-sm text-error-700-300">{trackersError}</p>
                    <button type="button" class="btn preset-outlined mt-3 enabled:cursor-pointer" onclick={() => void loadTrackers()}>Erneut versuchen</button>
                </div>
            {:else if trackers.length === 0}
                <p class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center text-sm text-surface-600-400">
                    Noch keine Tracker konfiguriert. Ein Administrator kann sie in den Einstellungen hinzufügen.
                </p>
            {:else}
                <div class="grid gap-3 sm:grid-cols-2">
                    {#each trackers as tracker (tracker.id)}
                        <TrackerOverviewCard {tracker} />
                    {/each}
                </div>
            {/if}
        </section>
    {/if}
</main>

