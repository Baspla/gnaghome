<script lang="ts">
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import Username from '$lib/components/Username.svelte';
    import Pagination from '$lib/components/Pagination.svelte';
    import type { CallItLeaderboardEntry } from './types';
    import { formatEuroPoints, formatPercent } from './format';

    type Props = {
        entries: CallItLeaderboardEntry[];
        currentUserId?: string;
        page?: number;
        pageCount?: number;
        onPageChange?: (page: number) => void;
    };

    let { entries, currentUserId, page = 1, pageCount = 1, onPageChange }: Props = $props();
</script>

<section class="overflow-hidden rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30" aria-labelledby="callit-leaderboard-heading">
    <div class="flex items-center justify-between gap-3 border-b border-surface-300-700/40 px-4 py-3 sm:px-5">
        <h2 id="callit-leaderboard-heading" class="text-lg font-semibold text-surface-950-50">Rangliste</h2>
        <span class="text-xs text-surface-600-400">Gesamt-Gewinn/Verlust inkl. laufender Vorhersagen · Rendite in % des Einsatzes</span>
    </div>

    {#if entries.length === 0}
        <p class="px-5 py-8 text-center text-sm text-surface-600-400">Noch keine Vorhersagen. Die Rangliste füllt sich mit der ersten Vorhersage.</p>
    {:else}
        <ol class="divide-y divide-surface-300-700/40">
            {#each entries as entry (entry.user.id)}
                <li class="flex items-center gap-3 px-4 py-3 sm:px-5 {entry.user.id === currentUserId ? 'bg-primary-500/10' : ''}">
                    <span class="w-7 shrink-0 text-center text-sm font-bold text-surface-600-400">{entry.rank}</span>
                    <ProfilePicture userId={entry.user.id} image={entry.user.image} name={entry.user.name} size="h-9 w-9" />
                    <div class="min-w-0 flex-1">
                        <div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                            <Username userId={entry.user.id} name={entry.user.name} image={entry.user.image} class="min-w-0 truncate text-sm font-semibold text-surface-950-50" />
                            <span class="text-surface-600-400" aria-hidden="true">·</span>
                            <a
                                href={`/callit/users/${encodeURIComponent(entry.user.id)}`}
                                class="shrink-0 text-xs font-medium text-primary-700-300 underline-offset-2 hover:underline"
                                aria-label={`Alle Call-it-Vorhersagen von ${entry.user.name} ansehen`}
                            >
                                Alle ansehen
                            </a>
                        </div>
                        <p class="text-xs text-surface-600-400">
                            {#if entry.activeCount > 0}
                                {entry.activeCount} laufend
                                {#if entry.completedCount > 0}· {/if}
                            {/if}
                            {#if entry.completedCount > 0}
                                {entry.wins} gewonnen
                                · {entry.losses} verloren
                            {:else if entry.activeCount === 0}
                                Noch keine Vorhersage
                            {/if}
                            {#if entry.activeCount > 0}
                                <span class="font-medium {entry.unrealizedProfit > 0 ? 'text-success-700-300' : entry.unrealizedProfit < 0 ? 'text-error-700-300' : ''}">
                                    · aktuell {formatEuroPoints(entry.unrealizedProfit, true)}
                                </span>
                            {/if}
                        </p>
                    </div>
                    <div class="flex shrink-0 items-baseline gap-2">
                        <span
                            class="text-xs font-medium text-surface-600-400"
                            title={`Rendite bezogen auf ${formatEuroPoints(entry.allTimeWagerTotal)} Einsatz`}
                        >
                            <span class="sr-only">Rendite </span>{formatPercent(entry.returnPercent)}
                        </span>
                        <a
                            href={`/callit/users/${encodeURIComponent(entry.user.id)}`}
                            class="rounded-lg px-2 py-1 text-sm font-bold underline-offset-2 hover:underline {entry.allTimeProfit > 0 ? 'text-success-700-300' : entry.allTimeProfit < 0 ? 'text-error-700-300' : 'text-surface-600-400'}"
                        >
                            {formatEuroPoints(entry.allTimeProfit, true)}
                        </a>
                    </div>
                </li>
            {/each}
        </ol>
    {/if}

    {#if onPageChange && pageCount > 1}
        <div class="border-t border-surface-300-700/40 px-4 py-3 sm:px-5">
            <Pagination {page} {pageCount} {onPageChange} label="Seiten für die Rangliste" />
        </div>
    {/if}
</section>
