<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { getGatewayManager } from "$lib/gateway/gateway-context.svelte";
    import { api } from "$lib/api";
    import Button from "$lib/components/Button.svelte";
    import { setPageTitle } from "$lib/utils";

    const gateway = getGatewayManager();
    let userCount = $state<number | null>(null);
    let totalCount = $state<number | null>(null);
    let loading = $state(true);
    let pendingRequests = $state(0);
    let errorMessage = $state<string | null>(null);

    function applyCounts(counts: { userCount: number; totalCount: number }) {
        userCount = Math.max(userCount ?? 0, counts.userCount);
        totalCount = Math.max(totalCount ?? 0, counts.totalCount);
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
        pendingRequests += 1;
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
        } finally {
            pendingRequests -= 1;
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
        <h1 class="text-3xl font-bold text-surface-950-50">Counter</h1>
        <p class="mt-2 text-surface-600-400">Every click counts for everyone.</p>
    </div>

    <Button
        type="button"
        onclick={increment}
        disabled={loading}
        aria-busy={pendingRequests > 0}
        class="rounded-2xl px-10 py-6 text-xl font-semibold shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
    >
        Click me
    </Button>
    <p class="-mt-6 text-sm text-surface-600-400" role="status" aria-live="polite">
        Pending clicks: {pendingRequests}
    </p>

    <div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2" aria-live="polite" aria-atomic="true">
        <section class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-6">
            <h2 class="text-sm font-medium uppercase tracking-wide text-surface-600-400">Your clicks</h2>
            <p class="mt-2 text-4xl font-bold tabular-nums text-surface-950-50">
                {loading ? "…" : (userCount ?? "—")}
            </p>
        </section>
        <section class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-6">
            <h2 class="text-sm font-medium uppercase tracking-wide text-surface-600-400">Global clicks</h2>
            <p class="mt-2 text-4xl font-bold tabular-nums text-surface-950-50">
                {loading ? "…" : (totalCount ?? "—")}
            </p>
        </section>
    </div>

    {#if errorMessage}
        <p class="text-sm text-error-600-400" role="alert">{errorMessage}</p>
    {/if}
</div>