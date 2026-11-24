<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import type { CrewNowStats } from './types';

    type Props = { userId: string };

    let { userId }: Props = $props();
    let stats = $state<CrewNowStats | null>(null);
    let loading = $state(true);
    let errorMessage = $state<string | null>(null);
    const gateway = getGatewayManager();

    async function loadStats() {
        try {
            const response = await api.crewnow.users({ id: userId }).stats.get();
            if (response.error || !response.data) throw new Error('load failed');
            stats = response.data;
            errorMessage = null;
        } catch {
            errorMessage = 'CrewNow-Statistik konnte nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        const unsubscribeStats = gateway.onEvent('crewnow.user-stats.changed', (event) => {
            if (event.entityId === userId) void loadStats();
        });
        const unsubscribeConnected = gateway.onConnected(() => void loadStats());
        void loadStats();
        return () => {
            unsubscribeStats();
            unsubscribeConnected();
        };
    });
</script>

<section class="w-full rounded-2xl border border-surface-300-700/60 bg-surface-100-900/30 p-4 text-left" aria-labelledby="crewnow-profile-stats-heading">
    <div class="flex items-center justify-between gap-3">
        <h2 id="crewnow-profile-stats-heading" class="text-sm font-semibold uppercase tracking-wide text-surface-600-400">CrewNow</h2>
        <a href="/crewnow" class="text-sm font-semibold text-primary-700-300 underline-offset-2 hover:underline">
            Zur CrewNow-Timeline
        </a>
    </div>

    {#if loading}
        <p class="mt-3 text-sm text-surface-600-400" role="status">Statistik wird geladen …</p>
    {:else if errorMessage}
        <p class="mt-3 text-sm text-error-700-300" role="alert">{errorMessage}</p>
    {:else if stats}
        <dl class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
                <dt class="text-xs text-surface-600-400">Posts</dt>
                <dd class="text-lg font-bold text-surface-950-50">{stats.postCount}</dd>
            </div>
        </dl>
    {:else}
        <p class="mt-3 text-sm text-surface-600-400">Noch keine CrewNow-Daten.</p>
    {/if}
</section>
