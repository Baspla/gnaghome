<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { getGatewayManager } from "$lib/gateway/gateway-context.svelte";
    import { api } from "$lib/api";
    import Button from "$lib/components/Button.svelte";
    import { setPageTitle } from "$lib/utils";

    const gateway = getGatewayManager();
    let userCount = $state<number | null>(null);
    let totalCount = $state<number | null>(null);
    let leaderboard = $state<{ rank: number; name: string; count: number }[]>([]);
    let loading = $state(true);
    let errorMessage = $state<string | null>(null);

    function applyCounts(counts: {
        userCount: number;
        totalCount: number;
        leaderboard: { rank: number; name: string; count: number }[];
    }) {
        const isCurrentOrNewer = counts.totalCount >= (totalCount ?? 0);
        userCount = Math.max(userCount ?? 0, counts.userCount);
        totalCount = Math.max(totalCount ?? 0, counts.totalCount);
        if (isCurrentOrNewer) {
            leaderboard = counts.leaderboard;
        }
    }

    async function refreshCounts() {
        try {
            const response = await api.counter.get();
            if (response.error || !response.data) {
                errorMessage = "Could not load the counter. Please try again.";
                return;
            }

            applyCounts(response.data);
            errorMessage = null;
        } catch {
            errorMessage = "Could not load the counter. Please try again.";
        }
    }

    async function increment() {
        errorMessage = null;

        try {
            const response = await api.counter.increment.post();
            if (response.error || !response.data) {
                errorMessage = "Could not record your click. Please try again.";
                return;
            }

            applyCounts(response.data);
        } catch {
            errorMessage = "Could not record your click. Please try again.";
        }
    }

    const unsubscribeEvent = gateway.onEvent((event) => {
        if (event.type === "counter.changed") {
            totalCount = Math.max(totalCount ?? 0, event.data.totalCount);
            void refreshCounts();
        }
    });
    const unsubscribeConnected = gateway.onConnected(() => void refreshCounts());

    onMount(() => {
        setPageTitle("Counter");
        void refreshCounts().finally(() => loading = false);
    });

    onDestroy(() => {
        unsubscribeEvent();
        unsubscribeConnected();
    });
</script>

<svelte:head>
    <title>Counter - Gnaghome</title>
</svelte:head>

<div class="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-8 px-4 py-10 text-center">
    <div>
        <h1 class="text-3xl font-bold text-surface-950-50">Clicker Game</h1>
    </div>

    <Button
        type="button"
        onclick={increment}
        disabled={loading}
        class="rounded-2xl px-10 py-6 text-xl font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
    >
        Knopf
    </Button>

    <div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2" aria-live="polite" aria-atomic="true">
        <section class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-6">
            <h2 class="text-sm font-medium uppercase tracking-wide text-surface-600-400">Du</h2>
            <p class="mt-2 text-4xl font-bold tabular-nums text-surface-950-50">
                {loading ? "…" : (userCount ?? "—")}
            </p>
        </section>
        <section class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-6">
            <h2 class="text-sm font-medium uppercase tracking-wide text-surface-600-400">Alle</h2>
            <p class="mt-2 text-4xl font-bold tabular-nums text-surface-950-50">
                {loading ? "…" : (totalCount ?? "—")}
            </p>
        </section>
    </div>

    <section class="w-full rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-6 text-left">
        <div class="mb-4 flex items-baseline justify-between gap-4">
            <h2 class="text-sm font-medium uppercase tracking-wide text-surface-600-400">Rangliste</h2>
            <span class="text-xs text-surface-600-400">Meiste Klicks</span>
        </div>
        {#if loading}
            <p class="py-4 text-center text-surface-600-400">Lade...</p>
        {:else if leaderboard.length === 0}
            <p class="py-4 text-center text-surface-600-400">Noch keine Spieler.</p>
        {:else}
            <ol class="divide-y divide-surface-300-700/40">
                {#each leaderboard as entry (entry.rank)}
                    <li class="flex items-center gap-4 py-3">
                        <span class="w-8 text-sm font-semibold tabular-nums text-surface-600-400">#{entry.rank}</span>
                        <span class="min-w-0 flex-1 truncate font-medium text-surface-950-50">{entry.name}</span>
                        <span class="text-sm tabular-nums text-surface-600-400">{entry.count} {entry.count === 1 ? "Klick" : "Klicks"}</span>
                    </li>
                {/each}
            </ol>
        {/if}
    </section>

    {#if errorMessage}
        <p class="text-sm text-error-600-400" role="alert">{errorMessage}</p>
    {/if}
</div>