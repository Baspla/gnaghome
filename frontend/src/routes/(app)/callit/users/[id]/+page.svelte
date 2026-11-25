<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/state';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import PageHeading from '$lib/components/PageHeading.svelte';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import Pagination from '$lib/components/Pagination.svelte';
    import PredictionCard from '$lib/components/callit/PredictionCard.svelte';
    import { formatEuroPoints } from '$lib/components/callit/format';
    import type { CallItUserPage } from '$lib/components/callit/types';
    import { setPageTitle } from '$lib/utils';

    const PREDICTIONS_PER_PAGE = 5;

    const gateway = getGatewayManager();
    const userId = $derived(page.params.id ?? '');
    let data = $state<CallItUserPage | null>(null);
    let loading = $state(true);
    let errorMessage = $state<string | null>(null);
    let activePage = $state(1);
    let completedPage = $state(1);

    const activePageCount = $derived(Math.max(1, Math.ceil((data?.activePredictions.length ?? 0) / PREDICTIONS_PER_PAGE)));
    const currentActivePage = $derived(Math.min(activePage, activePageCount));
    const visibleActivePredictions = $derived((data?.activePredictions ?? []).slice(
        (currentActivePage - 1) * PREDICTIONS_PER_PAGE,
        currentActivePage * PREDICTIONS_PER_PAGE,
    ));
    const completedPageCount = $derived(Math.max(1, Math.ceil((data?.completedPredictions.length ?? 0) / PREDICTIONS_PER_PAGE)));
    const currentCompletedPage = $derived(Math.min(completedPage, completedPageCount));
    const visibleCompletedPredictions = $derived((data?.completedPredictions ?? []).slice(
        (currentCompletedPage - 1) * PREDICTIONS_PER_PAGE,
        currentCompletedPage * PREDICTIONS_PER_PAGE,
    ));

    async function load() {
        try {
            const response = await api.callit.users({ id: userId }).get();
            if (response.error || !response.data) throw new Error('load failed');
            data = response.data;
            errorMessage = null;
        } catch {
            errorMessage = 'Die Call-it-Seite konnte nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        setPageTitle('Call it');
        const unsubscribeStats = gateway.onEvent('callit.user-stats.changed', (event) => {
            if (event.entityId === userId) void load();
        });
        const unsubscribePrediction = gateway.onEvent('callit.prediction.changed', () => void load());
        const unsubscribeTracker = gateway.onEvent('callit.tracker.changed', () => void load());
        const unsubscribeReaction = gateway.onEvent('reaction.changed', (event) => {
            if (event.entityId.startsWith('callit.prediction:')) void load();
        });
        const unsubscribeConnected = gateway.onConnected(() => void load());
        void load();
        return () => {
            unsubscribeStats();
            unsubscribePrediction();
            unsubscribeTracker();
            unsubscribeReaction();
            unsubscribeConnected();
        };
    });
</script>

<svelte:head>
    <title>Call it - Gnag Home</title>
    <meta name="description" content="Call-it-Vorhersagen und Statistik." />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
        <PageHeading title="Call it" subtitle={data ? `Vorhersagen von ${data.user.name}` : 'Vorhersagen und Statistik'} />
        <a href="/callit" class="btn preset-outlined shrink-0">Zurück</a>
    </header>

    {#if loading}
        <p class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-12 text-center text-surface-600-400" role="status">
            Vorhersagen werden geladen …
        </p>
    {:else if errorMessage}
        <div class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-8 text-center" role="alert">
            <p class="text-sm text-error-700-300">{errorMessage}</p>
            <button type="button" class="btn preset-outlined mt-3 enabled:cursor-pointer" onclick={() => void load()}>Erneut versuchen</button>
        </div>
    {:else if data}
        <section class="flex flex-wrap items-center gap-4 rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 p-4" aria-label="Profil und Statistik">
            <ProfilePicture userId={data.user.id} image={data.user.image} name={data.user.name} size="h-16 w-16 text-xl" />
            <div class="min-w-0 flex-1">
                <a href={`/profile/${encodeURIComponent(data.user.id)}`} class="text-xl font-bold text-surface-950-50 underline-offset-2 hover:underline">
                    {data.user.name}
                </a>
                <p class="text-sm text-surface-600-400">
                    {data.stats.activePredictionCount} laufend · {data.stats.completedCount} abgeschlossen
                    · {data.stats.wins} gewonnen · {data.stats.losses} verloren
                </p>
            </div>
            <div class="text-right">
                <p class="text-xs text-surface-600-400">Allzeit-Gewinn</p>
                <p class="text-xl font-bold {data.stats.allTimeProfit > 0 ? 'text-success-700-300' : data.stats.allTimeProfit < 0 ? 'text-error-700-300' : 'text-surface-950-50'}">
                    {formatEuroPoints(data.stats.allTimeProfit, true)}
                </p>
                <p class="text-xs text-surface-600-400">Aktuell: <span class="font-semibold {data.stats.unrealizedProfit > 0 ? 'text-success-700-300' : data.stats.unrealizedProfit < 0 ? 'text-error-700-300' : 'text-surface-600-400'}">{formatEuroPoints(data.stats.unrealizedProfit, true)}</span></p>
                <p class="text-xs text-surface-600-400">Aktiver Einsatz: {formatEuroPoints(data.stats.activeWagerTotal)}</p>
            </div>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-user-active-heading">
            <div class="flex items-baseline justify-between gap-3">
                <h2 id="callit-user-active-heading" class="text-lg font-semibold text-surface-950-50">Laufende Vorhersagen</h2>
                <span class="text-xs text-surface-600-400">{data.activePredictions.length}</span>
            </div>
            {#if data.activePredictions.length === 0}
                <p class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center text-sm text-surface-600-400">
                    Keine laufenden Vorhersagen.
                </p>
            {:else}
                {#each visibleActivePredictions as prediction (prediction.id)}
                    <PredictionCard {prediction} showUser={false} />
                {/each}
                <Pagination
                    page={currentActivePage}
                    pageCount={activePageCount}
                    onPageChange={(page) => activePage = page}
                    label="Seiten für laufende Vorhersagen"
                />
            {/if}
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="callit-user-completed-heading">
            <div class="flex items-baseline justify-between gap-3">
                <h2 id="callit-user-completed-heading" class="text-lg font-semibold text-surface-950-50">Abgeschlossene Vorhersagen</h2>
                <span class="text-xs text-surface-600-400">{data.completedPredictions.length}</span>
            </div>
            {#if data.completedPredictions.length === 0}
                <p class="rounded-2xl border border-dashed border-surface-300-700/60 px-5 py-8 text-center text-sm text-surface-600-400">
                    Noch keine abgeschlossenen Vorhersagen.
                </p>
            {:else}
                {#each visibleCompletedPredictions as prediction (prediction.id)}
                    <PredictionCard {prediction} showUser={false} />
                {/each}
                <Pagination
                    page={currentCompletedPage}
                    pageCount={completedPageCount}
                    onPageChange={(page) => completedPage = page}
                    label="Seiten für abgeschlossene Vorhersagen"
                />
            {/if}
        </section>

    {/if}
</main>

