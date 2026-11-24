<script lang="ts">
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import Username from '$lib/components/Username.svelte';
    import Reactions from '$lib/components/Reactions.svelte';
    import type { CallItPrediction } from './types';
    import {
        directionLabel,
        durationLabel,
        formatDateTime,
        formatEuroPoints,
        formatPercent,
        formatTrackerPrice,
    } from './format';

    type Props = {
        prediction: CallItPrediction;
        showUser?: boolean;
    };

    let { prediction, showUser = true }: Props = $props();
    let reactionCount = $state(0);
    let reactionEmoji = $state<string | null>(null);

    $effect(() => {
        reactionCount = prediction.reactionCount ?? 0;
        reactionEmoji = prediction.reactionEmoji ?? null;
    });

    const isActive = $derived(prediction.status === 'ACTIVE');
    const profit = $derived(isActive ? prediction.unrealizedProfitLoss : prediction.profitLoss);
    const resultPercent = $derived(prediction.priceChangePercent === null
        ? null
        : prediction.direction === 'UP'
            ? prediction.priceChangePercent
            : -prediction.priceChangePercent);
    const profitClass = $derived(profit === null || profit === 0
        ? 'text-surface-600-400'
        : profit > 0
            ? 'text-success-700-300'
            : 'text-error-700-300');

    function updateReactions(count: number, emoji: string | null) {
        reactionCount = count;
        reactionEmoji = emoji;
    }
</script>

<article class="flex flex-col gap-3 rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30 p-4 shadow-sm">
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2.5">
            {#if showUser}
                <ProfilePicture userId={prediction.user.id} image={prediction.user.image} name={prediction.user.name} size="h-9 w-9" />
            {/if}
            <div class="min-w-0">
                {#if showUser}
                    <Username userId={prediction.user.id} name={prediction.user.name} image={prediction.user.image} class="block truncate text-sm font-semibold text-surface-950-50" />
                {/if}
                <a
                    href={`/callit/trackers/${encodeURIComponent(prediction.tracker.id)}`}
                    class="block truncate text-sm text-primary-700-300 underline-offset-2 hover:underline"
                >
                    <span class="font-semibold">{prediction.tracker.symbol}</span>
                    <span class="text-surface-600-400"> · {prediction.tracker.name}</span>
                </a>
            </div>
        </div>
        <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold {prediction.direction === 'UP' ? 'bg-success-500 text-success-contrast-500' : 'bg-error-500 text-error-contrast-500'}">
            {directionLabel(prediction.direction)}
        </span>
    </div>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
            <dt class="text-xs text-surface-600-400">Einsatz</dt>
            <dd class="font-semibold text-surface-950-50">{formatEuroPoints(prediction.wager)}</dd>
        </div>
        <div>
            <dt class="text-xs text-surface-600-400">Laufzeit</dt>
            <dd class="font-semibold text-surface-950-50">{durationLabel(prediction.durationKey)}</dd>
        </div>
        <div>
            <dt class="text-xs text-surface-600-400">Startkurs</dt>
            <dd class="font-semibold text-surface-950-50">{formatTrackerPrice(prediction.startPrice, prediction.tracker.currency)}</dd>
        </div>
        <div>
            <dt class="text-xs text-surface-600-400">{isActive ? 'Aktueller Kurs' : 'Endkurs'}</dt>
            <dd class="font-semibold text-surface-950-50">
                {formatTrackerPrice(isActive ? prediction.currentPrice : prediction.endPrice, prediction.tracker.currency)}
            </dd>
        </div>
    </dl>

    <div class="flex flex-wrap items-end justify-between gap-3 border-t border-surface-300-700/30 pt-3">
        <div class="min-w-0">
            <p class="text-xs text-surface-600-400">{isActive ? 'Aktueller Gewinn/Verlust' : 'Ergebnis'}</p>
            <p class="text-lg font-bold {profitClass}">
                {profit === null ? '—' : formatEuroPoints(profit, true)}
                {#if !isActive && resultPercent !== null}
                    <span class="ml-2 text-xs font-medium text-surface-600-400">{formatPercent(resultPercent)}</span>
                {/if}
            </p>
            <p class="mt-0.5 text-xs text-surface-600-400">
                {#if isActive}
                    Läuft bis {formatDateTime(prediction.endsAt)}
                {:else}
                    Aufgelöst am {prediction.resolvedAt ? formatDateTime(prediction.resolvedAt) : '—'}
                {/if}
            </p>
        </div>
        <Reactions
            targetType="callit.prediction"
            targetId={prediction.id}
            count={reactionCount}
            {reactionEmoji}
            onReactionsChange={updateReactions}
            triggerClass="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-surface-300-700/60 bg-surface-50-950/90 px-3 text-sm text-surface-800-200 transition-colors hover:bg-surface-50-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        />
    </div>
</article>
