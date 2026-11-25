<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import { formatEuroPoints } from './format';
    import type { CallItStats } from './types';

    type Props = { userId: string };

    let { userId }: Props = $props();
    let stats = $state<CallItStats | null>(null);
    let loading = $state(true);
    let errorMessage = $state<string | null>(null);
    const gateway = getGatewayManager();

    async function loadStats() {
        try {
            const response = await api.callit.users({ id: userId }).get();
            if (response.error || !response.data) throw new Error('load failed');
            stats = response.data.stats;
            errorMessage = null;
        } catch {
            errorMessage = 'Call-it-Statistik konnte nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const unsubscribeStats = gateway.onEvent('callit.user-stats.changed', (event) => {
            if (event.entityId === userId) void loadStats();
        });
        // Active prediction values change with every tracker price sync.
        const unsubscribeTracker = gateway.onEvent('callit.tracker.changed', () => void loadStats());
        const unsubscribeConnected = gateway.onConnected(() => void loadStats());
        void loadStats();
        return () => {
            unsubscribeStats();
            unsubscribeTracker();
            unsubscribeConnected();
        };
    });
</script>

<section class="w-full rounded-2xl border border-surface-300-700/60 bg-surface-100-900/30 p-4 text-left" aria-labelledby="callit-profile-stats-heading">
    <div class="flex items-center justify-between gap-3">
        <h2 id="callit-profile-stats-heading" class="text-sm font-semibold uppercase tracking-wide text-surface-600-400">Call it</h2>
        <a href={`/callit/users/${encodeURIComponent(userId)}`} class="text-sm font-semibold text-primary-700-300 underline-offset-2 hover:underline">
            Alle Vorhersagen ansehen
        </a>
    </div>

    {#if loading}
        <p class="mt-3 text-sm text-surface-600-400" role="status">Statistik wird geladen …</p>
    {:else if errorMessage}
        <p class="mt-3 text-sm text-error-700-300" role="alert">{errorMessage}</p>
    {:else if stats}
        <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
                <dt class="text-xs text-surface-600-400">Laufende Vorhersagen</dt>
                <dd class="text-lg font-bold text-surface-950-50">{stats.activePredictionCount}</dd>
            </div>
            <div>
                <dt class="text-xs text-surface-600-400">Aktiver Einsatz</dt>
                <dd class="text-lg font-bold text-surface-950-50">{formatEuroPoints(stats.activeWagerTotal)}</dd>
            </div>
            <div>
                <dt class="text-xs text-surface-600-400">Allzeit-Gewinn</dt>
                <dd class="text-lg font-bold {stats.allTimeProfit > 0 ? 'text-success-700-300' : stats.allTimeProfit < 0 ? 'text-error-700-300' : 'text-surface-950-50'}">
                    {formatEuroPoints(stats.allTimeProfit, true)}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-surface-600-400">Aktuell</dt>
                <dd class="text-lg font-bold {stats.unrealizedProfit > 0 ? 'text-success-700-300' : stats.unrealizedProfit < 0 ? 'text-error-700-300' : 'text-surface-950-50'}">
                    {formatEuroPoints(stats.unrealizedProfit, true)}
                </dd>
            </div>
            <div>
                <dt class="text-xs text-surface-600-400">Abgeschlossen</dt>
                <dd class="text-lg font-bold text-surface-950-50">{stats.completedCount}</dd>
            </div>
        </dl>
    {:else}
        <p class="mt-3 text-sm text-surface-600-400">Noch keine Call-it-Daten.</p>
    {/if}
</section>
