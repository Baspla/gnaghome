<script lang="ts">
    import { onMount } from 'svelte';
    import { ArrowDown, ArrowUp } from '@lucide/svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import PageHeading from '$lib/components/PageHeading.svelte';
    import Button from '$lib/components/Button.svelte';
    import PriceHistoryChart from '$lib/components/callit/PriceHistoryChart.svelte';
    import HistoryRangeSelector from '$lib/components/callit/HistoryRangeSelector.svelte';
    import { toaster } from '$lib/toaster';
    import { durationLabel, formatEuroPoints, formatTrackerPrice } from '$lib/components/callit/format';
    import type {
        CallItDirection,
        CallItDurationKey,
        CallItHistoryPoint,
        CallItOverview,
        CallItTrackerListItem,
    } from '$lib/components/callit/types';
    import { setPageTitle } from '$lib/utils';

    const gateway = getGatewayManager();
    const wagerOptions = [100, 250, 500, 1000] as const;
    const durationOptions: CallItDurationKey[] = ['1d', '2d', '3d', '5d', '7d', '1m'];
    const currentUserId = $derived(page.data.user?.id ?? '');

    let trackers = $state<CallItTrackerListItem[]>([]);
    let overview = $state<CallItOverview | null>(null);
    let trackerId = $state('');
    let direction = $state<CallItDirection>('UP');
    let durationKey = $state<CallItDurationKey>('1d');
    let wager = $state<number>(100);
    let predictionId = $state(typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
    let loading = $state(true);
    let submitting = $state(false);
    let errorMessage = $state<string | null>(null);
    let trackerHistory = $state<CallItHistoryPoint[]>([]);
    let trackerHistoryLoading = $state(false);
    let trackerHistoryError = $state<string | null>(null);
    let trackerHistoryRequest = 0;
    let historyDays = $state(30);

    $effect(() => {
        // Reuse the same ID for retries of the same form values, but never for changed inputs.
        trackerId;
        direction;
        durationKey;
        wager;
        if (typeof crypto !== 'undefined') predictionId = crypto.randomUUID();
    });

    const selectedTracker = $derived(trackers.find((tracker) => tracker.id === trackerId) ?? null);
    const atLimit = $derived(Boolean(overview && overview.myStats.activePredictionCount >= overview.limits.maxActivePredictionsPerUser));

    async function loadTrackerHistory() {
        const requestedId = trackerId;
        if (!requestedId) {
            trackerHistory = [];
            trackerHistoryLoading = false;
            trackerHistoryError = null;
            return;
        }
        const request = ++trackerHistoryRequest;
        trackerHistoryLoading = true;
        trackerHistoryError = null;
        try {
            const response = await api.callit.trackers({ id: requestedId }).get({ query: { historyDays } });
            if (response.error || !response.data) throw new Error('load failed');
            if (request !== trackerHistoryRequest || requestedId !== trackerId) return;
            trackerHistory = response.data.history;
        } catch {
            if (request === trackerHistoryRequest && requestedId === trackerId) {
                trackerHistory = [];
                trackerHistoryError = 'Kursverlauf konnte nicht geladen werden.';
            }
        } finally {
            if (request === trackerHistoryRequest && requestedId === trackerId) {
                trackerHistoryLoading = false;
            }
        }
    }

    function setHistoryRange(days: number) {
        if (historyDays === days) return;
        historyDays = days;
        void loadTrackerHistory();
    }

    async function load() {
        try {
            const [trackersResponse, overviewResponse] = await Promise.all([
                api.callit.trackers.get(),
                api.callit.overview.get(),
            ]);
            if (trackersResponse.error || !trackersResponse.data) throw new Error('Tracker konnten nicht geladen werden.');
            if (overviewResponse.error || !overviewResponse.data) throw new Error('Deine Vorhersagen konnten nicht geladen werden.');
            trackers = trackersResponse.data.items;
            overview = overviewResponse.data;
            const requested = page.url.searchParams.get('tracker');
            if (!trackerId) {
                trackerId = requested && trackers.some((tracker) => tracker.id === requested)
                    ? requested
                    : trackers[0]?.id ?? '';
            }
            errorMessage = null;
            await loadTrackerHistory();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Die Vorhersageseite konnte nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    async function submit(event: SubmitEvent) {
        event.preventDefault();
        if (submitting || !selectedTracker || atLimit) return;
        submitting = true;
        errorMessage = null;
        try {
            const response = await api.callit.predictions.post({
                id: predictionId || crypto.randomUUID(),
                trackerId: selectedTracker.id,
                direction,
                durationKey,
                wager: wager as 100 | 250 | 500 | 1000,
            });
            if (response.error || !response.data) {
                const requestError: unknown = response.error;
                const value: unknown = typeof requestError === 'object' && requestError !== null
                    ? Reflect.get(requestError, 'value')
                    : undefined;
                const body: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'error') : undefined;
                const message: unknown = typeof body === 'object' && body !== null ? Reflect.get(body, 'message') : undefined;
                throw new Error(typeof message === 'string' ? message : 'Die Vorhersage konnte nicht erstellt werden.');
            }
            toaster.success({ title: 'Vorhersage platziert', description: `${selectedTracker.symbol} · ${durationLabel(durationKey)}` });
            await goto(`/callit/users/${encodeURIComponent(currentUserId)}`);
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Die Vorhersage konnte nicht erstellt werden.';
        } finally {
            submitting = false;
        }
    }

    onMount(() => {
        setPageTitle('Neue Vorhersage');
        const unsubscribeTracker = gateway.onEvent('callit.tracker.changed', () => void load());
        const unsubscribeSettings = gateway.onEvent('callit.settings.changed', () => void load());
        const unsubscribeStats = gateway.onEvent('callit.user-stats.changed', () => void load());
        const unsubscribeConnected = gateway.onConnected(() => void load());
        void load();
        return () => {
            unsubscribeTracker();
            unsubscribeSettings();
            unsubscribeStats();
            unsubscribeConnected();
        };
    });
</script>

<svelte:head>
    <title>Neue Vorhersage - Call it - Gnag Home</title>
    <meta name="description" content="Platziere eine neue Call-it-Vorhersage auf einen Kurs." />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
        <PageHeading title="Neue Vorhersage" subtitle="Wähle Tracker, Richtung, Laufzeit und Einsatz." />
        <a href="/callit" class="btn preset-outlined shrink-0">Zurück</a>
    </header>

    {#if loading}
        <p class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 px-6 py-12 text-center text-surface-600-400" role="status">
            Tracker werden geladen …
        </p>
    {:else if trackers.length === 0}
        <div class="rounded-2xl border border-dashed border-surface-300-700/60 px-6 py-10 text-center">
            <p class="text-sm text-surface-600-400">Es sind noch keine Tracker konfiguriert. Ein Administrator kann sie in den Einstellungen hinzufügen.</p>
        </div>
    {:else}
        <form class="flex flex-col gap-5 rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 p-4 sm:p-5" onsubmit={submit}>
            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">Tracker</span>
                <select
                    class="select w-full"
                    value={trackerId}
                    disabled={submitting}
                    onchange={(event) => {
                        trackerId = event.currentTarget.value;
                        void loadTrackerHistory();
                    }}
                >
                    {#each trackers as tracker (tracker.id)}
                        <option value={tracker.id}>{tracker.symbol} · {tracker.name}</option>
                    {/each}
                </select>
                {#if selectedTracker}
                    <span class="text-xs text-surface-600-400">
                        Aktueller Kurs: {formatTrackerPrice(selectedTracker.lastPrice, selectedTracker.currency)}
                        · {selectedTracker.activePredictionCount} laufende Vorhersagen
                    </span>
                {/if}
            </label>

            {#if selectedTracker}
                <div class="rounded-xl border border-surface-300-700/40 bg-surface-50-950/40 p-3">
                    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h2 class="text-sm font-semibold text-surface-950-50">Kursverlauf · {selectedTracker.symbol}</h2>
                        <HistoryRangeSelector
                            value={historyDays}
                            onChange={setHistoryRange}
                            label="Zeitraum für den Kursverlauf"
                        />
                    </div>
                    {#if trackerHistoryLoading}
                        <p class="py-6 text-center text-sm text-surface-600-400" role="status">Kursverlauf wird geladen …</p>
                    {:else if trackerHistoryError}
                        <p class="py-6 text-center text-sm text-error-700-300" role="alert">{trackerHistoryError}</p>
                    {:else}
                        <PriceHistoryChart points={trackerHistory} currency={selectedTracker.currency} height={160} />
                    {/if}
                </div>
            {/if}

            <fieldset class="flex flex-col gap-2" disabled={submitting}>
                <legend class="font-medium">Richtung</legend>
                <div class="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        aria-pressed={direction === 'UP'}
                        class="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors enabled:cursor-pointer {direction === 'UP' ? 'border-success-500 bg-success-500 text-success-contrast-500' : 'border-surface-300-700 hover:bg-surface-100-900'}"
                        onclick={() => direction = 'UP'}
                    >
                        <ArrowUp class="h-4 w-4" aria-hidden="true" />
                        Steigt
                    </button>
                    <button
                        type="button"
                        aria-pressed={direction === 'DOWN'}
                        class="inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors enabled:cursor-pointer {direction === 'DOWN' ? 'border-error-500 bg-error-500 text-error-contrast-500' : 'border-surface-300-700 hover:bg-surface-100-900'}"
                        onclick={() => direction = 'DOWN'}
                    >
                        <ArrowDown class="h-4 w-4" aria-hidden="true" />
                        Fällt
                    </button>
                </div>
            </fieldset>

            <label class="flex flex-col gap-1 text-sm">
                <span class="font-medium">Laufzeit</span>
                <select class="select w-full" bind:value={durationKey} disabled={submitting}>
                    {#each durationOptions as option (option)}
                        <option value={option}>{durationLabel(option)}</option>
                    {/each}
                </select>
            </label>

            <fieldset class="flex flex-col gap-2" disabled={submitting}>
                <legend class="font-medium">Einsatz</legend>
                <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {#each wagerOptions as option (option)}
                        <button
                            type="button"
                            aria-pressed={wager === option}
                            class="rounded-lg border px-3 py-2 text-sm font-semibold transition-colors enabled:cursor-pointer {wager === option ? 'border-primary-500 bg-primary-500 text-primary-contrast-500' : 'border-surface-300-700 hover:bg-surface-100-900'}"
                            onclick={() => wager = option}
                        >
                            {formatEuroPoints(option)}
                        </button>
                    {/each}
                </div>
            </fieldset>

            {#if overview}
                <p class="text-sm {atLimit ? 'text-warning-700-300' : 'text-surface-600-400'}">
                    Laufende Vorhersagen: {overview.myStats.activePredictionCount} / {overview.limits.maxActivePredictionsPerUser}
                    {#if atLimit}
                        · Du hast das Limit erreicht. Schließe zuerst eine Vorhersage ab.
                    {/if}
                </p>
            {/if}

            {#if errorMessage}<p class="text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}

            <div class="flex flex-wrap items-center justify-end gap-3 border-t border-surface-300-700/30 pt-4">
                <Button type="submit" disabled={submitting || atLimit || !selectedTracker}>
                    {submitting ? 'Wird platziert …' : 'Vorhersage platzieren'}
                </Button>
            </div>
        </form>
    {/if}
</main>

