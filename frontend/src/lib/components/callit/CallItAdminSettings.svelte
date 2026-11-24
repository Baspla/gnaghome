<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import Button from '$lib/components/Button.svelte';
    import AlertDialog from '$lib/components/customdialog/AlertDialog.svelte';
    import PriceHistoryChart from './PriceHistoryChart.svelte';
    import type { CallItSettings, CallItTrackerListItem, CallItTrackerPreview } from './types';
    import { formatDateTime, formatTrackerPrice } from './format';

    const intervalOptions = [5, 10, 15, 20, 30, 60] as const;
    const gateway = getGatewayManager();

    let settings = $state<CallItSettings | null>(null);
    let trackers = $state<CallItTrackerListItem[]>([]);
    let loading = $state(true);
    let savingSettings = $state(false);
    let addingTracker = $state(false);
    let busyTrackerId = $state<string | null>(null);
    let intervalDraft = $state<number>(15);
    let limitDraft = $state<number>(6);
    let symbolDraft = $state('');
    let nameDraft = $state('');
    let removeTrackerId = $state<string | null>(null);
    let removeDialogOpen = $state(false);
    let preview = $state<CallItTrackerPreview | null>(null);
    let previewLoading = $state(false);
    let previewError = $state<string | null>(null);
    let previewRequestId = 0;
    let fullRemoveTrackerId = $state<string | null>(null);
    let fullRemoveDialogOpen = $state(false);
    let fullRemoving = $state(false);
    let errorMessage = $state<string | null>(null);
    let successMessage = $state<string | null>(null);

    const previewMatchesSymbol = $derived(
        preview !== null && preview.symbol === symbolDraft.trim().toUpperCase(),
    );

    function marketStateLabel(state: string | null): string {
        switch (state) {
            case 'REGULAR': return 'Markt geöffnet';
            case 'CLOSED': return 'Markt geschlossen';
            case 'PRE':
            case 'PREPRE': return 'Vorbörse';
            case 'POST':
            case 'POSTPOST': return 'Nachbörse';
            default: return 'Marktstatus unbekannt';
        }
    }

    function apiErrorMessage(response: unknown, fallback: string): string | null {
        const requestError: unknown = typeof response === 'object' && response !== null
            ? Reflect.get(response, 'error')
            : undefined;
        if (requestError === undefined || requestError === null) return null;
        const errorValue: unknown = typeof requestError === 'object' && requestError !== null
            ? Reflect.get(requestError, 'value')
            : undefined;
        const errorBody: unknown = typeof errorValue === 'object' && errorValue !== null
            ? Reflect.get(errorValue, 'error')
            : undefined;
        const message: unknown = typeof errorBody === 'object' && errorBody !== null
            ? Reflect.get(errorBody, 'message')
            : undefined;
        return typeof message === 'string' ? message : fallback;
    }

    async function load() {
        try {
            const [settingsResponse, trackersResponse] = await Promise.all([
                api.callit.admin.settings.get(),
                api.callit.admin.trackers.get(),
            ]);
            const settingsError = apiErrorMessage(settingsResponse, 'Einstellungen konnten nicht geladen werden.');
            const trackersError = apiErrorMessage(trackersResponse, 'Tracker konnten nicht geladen werden.');
            if (settingsError) throw new Error(settingsError);
            if (trackersError) throw new Error(trackersError);
            if (!settingsResponse.data || !trackersResponse.data) throw new Error('load failed');
            const initialLoad = settings === null;
            settings = settingsResponse.data;
            trackers = trackersResponse.data.items;
            if (initialLoad) {
                intervalDraft = settings.updateIntervalMinutes;
                limitDraft = settings.maxActivePredictionsPerUser;
            }
            errorMessage = null;
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Call-it-Verwaltung konnte nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    async function saveSettings(event: SubmitEvent) {
        event.preventDefault();
        if (savingSettings) return;
        if (!Number.isInteger(limitDraft) || limitDraft < 1 || limitDraft > 50) {
            errorMessage = 'Das Limit muss zwischen 1 und 50 liegen.';
            return;
        }
        savingSettings = true;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.callit.admin.settings.put({
                updateIntervalMinutes: intervalDraft as 5 | 10 | 15 | 20 | 30 | 60,
                maxActivePredictionsPerUser: limitDraft,
            });
            const message = apiErrorMessage(response, 'Einstellungen konnten nicht gespeichert werden.');
            if (message) throw new Error(message);
            if (response.data) {
                settings = response.data;
                intervalDraft = response.data.updateIntervalMinutes;
                limitDraft = response.data.maxActivePredictionsPerUser;
            }
            successMessage = 'Call-it-Einstellungen gespeichert.';
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Einstellungen konnten nicht gespeichert werden.';
        } finally {
            savingSettings = false;
        }
    }

    function clearPreview() {
        previewRequestId += 1;
        previewLoading = false;
        if (preview && nameDraft.trim() === (preview.name ?? '').trim()) {
            nameDraft = '';
        }
        preview = null;
        previewError = null;
    }

    function handleSymbolInput() {
        const normalized = symbolDraft.trim().toUpperCase();
        if (preview && preview.symbol === normalized) return;
        if (preview) nameDraft = '';
        clearPreview();
    }

    async function previewTracker() {
        const symbol = symbolDraft.trim().toUpperCase();
        if (!symbol || previewLoading) return;
        const requestId = ++previewRequestId;
        previewLoading = true;
        previewError = null;
        preview = null;
        try {
            const response = await api.callit.admin.trackers.preview.post({ symbol });
            if (requestId !== previewRequestId) return;
            const message = apiErrorMessage(response, 'Symbol konnte nicht geprüft werden.');
            if (message) throw new Error(message);
            if (!response.data) throw new Error('Symbol konnte nicht geprüft werden.');
            preview = response.data;
            if (!nameDraft.trim() && response.data.name) nameDraft = response.data.name;
        } catch (error) {
            if (requestId !== previewRequestId) return;
            previewError = error instanceof Error ? error.message : 'Symbol konnte nicht geprüft werden.';
        } finally {
            if (requestId === previewRequestId) previewLoading = false;
        }
    }

    async function addTracker(event: SubmitEvent) {
        event.preventDefault();
        if (addingTracker || !previewMatchesSymbol || preview?.existingTracker?.isActive) return;
        addingTracker = true;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.callit.admin.trackers.post({
                symbol: symbolDraft.trim().toUpperCase(),
                ...(nameDraft.trim() ? { name: nameDraft.trim() } : {}),
            });
            const message = apiErrorMessage(response, 'Tracker konnte nicht hinzugefügt werden.');
            if (message) throw new Error(message);
            symbolDraft = '';
            nameDraft = '';
            clearPreview();
            successMessage = 'Tracker hinzugefügt oder reaktiviert.';
            await load();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Tracker konnte nicht hinzugefügt werden.';
        } finally {
            addingTracker = false;
        }
    }

    function requestRemove(trackerId: string) {
        removeTrackerId = trackerId;
        removeDialogOpen = true;
    }

    async function removeTracker() {
        if (!removeTrackerId || busyTrackerId) return;
        const trackerId = removeTrackerId;
        busyTrackerId = trackerId;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.callit.admin.trackers({ id: trackerId }).delete();
            const message = apiErrorMessage(response, 'Tracker konnte nicht entfernt werden.');
            if (message) throw new Error(message);
            if (preview?.existingTracker?.id === trackerId) clearPreview();
            successMessage = 'Tracker entfernt. Bestehende Vorhersagen werden weiterhin aufgelöst.';
            await load();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Tracker konnte nicht entfernt werden.';
        } finally {
            busyTrackerId = null;
            removeTrackerId = null;
            removeDialogOpen = false;
        }
    }

    function requestFullRemove(trackerId: string) {
        fullRemoveTrackerId = trackerId;
        fullRemoveDialogOpen = true;
    }

    async function fullyRemoveTracker() {
        if (!fullRemoveTrackerId || fullRemoving) return;
        const trackerId = fullRemoveTrackerId;
        fullRemoving = true;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.callit.admin.trackers({ id: trackerId }).full.delete();
            const message = apiErrorMessage(response, 'Tracker konnte nicht vollständig entfernt werden.');
            if (message) throw new Error(message);
            clearPreview();
            successMessage = 'Tracker vollständig entfernt.';
            await load();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Tracker konnte nicht vollständig entfernt werden.';
        } finally {
            fullRemoving = false;
            fullRemoveTrackerId = null;
            fullRemoveDialogOpen = false;
        }
    }

    async function reactivateTracker(tracker: CallItTrackerListItem) {
        if (busyTrackerId) return;
        busyTrackerId = tracker.id;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.callit.admin.trackers.post({ symbol: tracker.symbol, name: tracker.name });
            const message = apiErrorMessage(response, 'Tracker konnte nicht reaktiviert werden.');
            if (message) throw new Error(message);
            if (preview?.existingTracker?.id === tracker.id) clearPreview();
            successMessage = 'Tracker reaktiviert.';
            await load();
        } catch (error) {
            errorMessage = error instanceof Error ? error.message : 'Tracker konnte nicht reaktiviert werden.';
        } finally {
            busyTrackerId = null;
        }
    }

    onMount(() => {
        const unsubscribeTracker = gateway.onEvent('callit.tracker.changed', () => void load());
        const unsubscribeSettings = gateway.onEvent('callit.settings.changed', () => void load());
        const unsubscribeConnected = gateway.onConnected(() => void load());
        void load();
        return () => {
            unsubscribeTracker();
            unsubscribeSettings();
            unsubscribeConnected();
        };
    });

</script>

<section class="flex flex-col gap-5 pr-3 pb-3" aria-labelledby="callit-admin-heading">
    <div>
        <h2 id="callit-admin-heading" class="text-lg font-semibold">Call it</h2>
        <p class="mt-1 text-sm text-surface-contrast-400-800">Tracker und globale Spielregeln für Call it verwalten.</p>
    </div>

    {#if loading}
        <p class="text-sm text-surface-contrast-400-800" role="status">Call-it-Verwaltung wird geladen …</p>
    {:else}
        <form class="flex flex-col gap-4 rounded-xl border border-surface-300-700/50 p-4" onsubmit={saveSettings}>
            <div class="grid gap-4 sm:grid-cols-2">
                <label class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">Aktualisierungsintervall</span>
                    <select class="select w-full" bind:value={intervalDraft} disabled={savingSettings}>
                        {#each intervalOptions as interval (interval)}
                            <option value={interval}>{interval} Minuten</option>
                        {/each}
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">Max. gleichzeitige Vorhersagen pro Person</span>
                    <input class="input w-full" type="number" min="1" max="50" bind:value={limitDraft} disabled={savingSettings} required />
                </label>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs text-surface-contrast-400-800">
                    Zuletzt synchronisiert: {settings?.lastSyncAt ? formatDateTime(settings.lastSyncAt) : 'noch nie'}
                </p>
                <Button type="submit" disabled={savingSettings}>{savingSettings ? 'Wird gespeichert …' : 'Einstellungen speichern'}</Button>
            </div>
            {#if settings?.lastSyncError}
                <p class="text-sm text-warning-700-300" role="status">Letzter Synchronisierungsfehler: {settings.lastSyncError}</p>
            {/if}
        </form>

        <form class="flex flex-col gap-3 rounded-xl border border-surface-300-700/50 p-4" onsubmit={addTracker}>
            <div>
                <h3 class="font-semibold">Tracker hinzufügen</h3>
                <p class="mt-1 text-sm text-surface-contrast-400-800">Lade zuerst eine Vorschau, um Kurs, Marktstatus und vorhandene Tracker zu prüfen. Entfernte Symbole werden beim erneuten Hinzufügen reaktiviert.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
                <label class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">Symbol</span>
                    <input
                        class="input w-full uppercase"
                        bind:value={symbolDraft}
                        oninput={handleSymbolInput}
                        maxlength="20"
                        placeholder="AAPL"
                        required
                        disabled={addingTracker}
                    />
                </label>
                <label class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">Anzeigename (optional)</span>
                    <input class="input w-full" bind:value={nameDraft} maxlength="80" placeholder="Apple Inc." disabled={addingTracker} />
                </label>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="outlined"
                    disabled={previewLoading || addingTracker || !symbolDraft.trim()}
                    onclick={() => void previewTracker()}
                >
                    {previewLoading ? 'Wird geprüft …' : 'Vorschau'}
                </Button>
                <Button
                    type="submit"
                    disabled={addingTracker || !previewMatchesSymbol || preview?.existingTracker?.isActive}
                >
                    {addingTracker ? 'Wird hinzugefügt …' : 'Tracker hinzufügen'}
                </Button>
            </div>
            {#if symbolDraft.trim() && !previewMatchesSymbol && !previewLoading && !previewError}
                <p class="text-xs text-surface-contrast-400-800">Bitte zuerst die Vorschau für dieses Symbol laden.</p>
            {/if}

            {#if previewLoading}
                <p class="text-sm text-surface-contrast-400-800" role="status">Symbol wird geprüft …</p>
            {:else if previewError}
                <p class="text-sm text-error-700-300" role="alert">{previewError}</p>
            {:else if preview}
                <div class="rounded-xl border border-surface-300-700/60 bg-surface-50-950/40 p-3">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0">
                            <p class="font-semibold text-surface-950-50">{preview.symbol}</p>
                            <p class="truncate text-sm text-surface-600-400">{preview.name ?? '—'}</p>
                        </div>
                        <div class="text-right text-sm">
                            <p class="font-medium text-surface-950-50">{formatTrackerPrice(preview.price, preview.currency)}</p>
                            <p class="text-xs text-surface-600-400">{marketStateLabel(preview.marketState)}</p>
                        </div>
                    </div>
                    <div class="mt-3">
                        <PriceHistoryChart points={preview.history} currency={preview.currency} height={140} />
                    </div>
                    {#if preview.existingTracker?.isActive}
                        <p class="mt-3 text-sm text-warning-700-300" role="status">Dieser Tracker ist bereits aktiv und kann nicht erneut hinzugefügt werden.</p>
                    {:else if preview.existingTracker}
                        <p class="mt-3 text-sm text-surface-contrast-400-800" role="status">Dieser Tracker ist entfernt. Hinzufügen reaktiviert ihn.</p>
                    {:else}
                        <p class="mt-3 text-sm text-success-700-300" role="status">Symbol ist gültig und kann hinzugefügt werden.</p>
                    {/if}
                    {#if preview.marketTime}
                        <p class="mt-1 text-xs text-surface-600-400">Letzter Kursstand: {formatDateTime(preview.marketTime)}</p>
                    {/if}
                </div>
            {/if}
        </form>
    {/if}


    {#if !loading}
        <section aria-labelledby="callit-trackers-heading" class="flex flex-col gap-3">
            <h3 id="callit-trackers-heading" class="font-semibold">Tracker</h3>
            {#if trackers.length === 0}
                <p class="text-sm text-surface-contrast-400-800">Noch keine Tracker angelegt.</p>
            {:else}
                <ul class="flex flex-col divide-y divide-surface-300-700 rounded-xl border border-surface-300-700/50">
                    {#each trackers as tracker (tracker.id)}
                        <li class="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
                            <div class="min-w-40 flex-1">
                                <p class="flex flex-wrap items-center gap-2 font-semibold">
                                    {tracker.symbol}
                                    {#if !tracker.isActive}
                                        <span class="rounded-full bg-surface-300-700 px-2 py-0.5 text-xs font-medium text-surface-contrast-300-700">Entfernt</span>
                                    {/if}
                                </p>
                                <p class="text-sm text-surface-contrast-400-800">{tracker.name}</p>
                            </div>
                            <div class="text-right text-sm">
                                <p class="font-medium">{formatTrackerPrice(tracker.lastPrice, tracker.currency)}</p>
                                <p class="text-xs text-surface-contrast-400-800">{tracker.activePredictionCount} aktive Vorhersagen</p>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                {#if tracker.isActive}
                                    <Button type="button" variant="outlined-error" disabled={busyTrackerId === tracker.id || fullRemoving} onclick={() => requestRemove(tracker.id)}>
                                        Entfernen
                                    </Button>
                                {:else}
                                    <Button type="button" variant="outlined" disabled={busyTrackerId === tracker.id || fullRemoving} onclick={() => void reactivateTracker(tracker)}>
                                        Reaktivieren
                                    </Button>
                                {/if}
                                <Button type="button" variant="error" disabled={fullRemoving || busyTrackerId === tracker.id} onclick={() => requestFullRemove(tracker.id)}>
                                    Vollständig entfernen
                                </Button>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/if}

    {#if errorMessage}<p class="text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}
    {#if successMessage}<p class="text-sm text-success-700-300" role="status">{successMessage}</p>{/if}

    <AlertDialog
        bind:open={removeDialogOpen}
        actionLabel={busyTrackerId ? 'Wird entfernt …' : 'Tracker entfernen'}
        variant="error"
        onAction={() => void removeTracker()}
    >
        {#snippet title()}Tracker entfernen?{/snippet}
        {#snippet description()}Der Tracker wird aus der Auswahl entfernt. Bereits laufende Vorhersagen werden weiterhin synchronisiert und aufgelöst; Verlauf und Kommentare bleiben erhalten.{/snippet}
    </AlertDialog>

    <AlertDialog
        bind:open={fullRemoveDialogOpen}
        actionLabel={fullRemoving ? 'Wird gelöscht …' : 'Endgültig löschen'}
        variant="error"
        onAction={() => void fullyRemoveTracker()}
    >
        {#snippet title()}Tracker vollständig entfernen?{/snippet}
        {#snippet description()}Tracker, alle laufenden und abgeschlossenen Vorhersagen, Kursverlauf, Reaktionen und Kommentare werden dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.{/snippet}
    </AlertDialog>
</section>

