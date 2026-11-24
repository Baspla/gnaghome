<script lang="ts">
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import Username from '$lib/components/Username.svelte';
    import type { CallItLeaderboardEntry } from './types';
    import { formatEuroPoints } from './format';

    type Props = {
        entries: CallItLeaderboardEntry[];
        currentUserId?: string;
    };

    let { entries, currentUserId }: Props = $props();
</script>

<section class="overflow-hidden rounded-2xl border border-surface-300-700/40 bg-surface-100-900/30" aria-labelledby="callit-leaderboard-heading">
    <div class="flex items-center justify-between gap-3 border-b border-surface-300-700/40 px-4 py-3 sm:px-5">
        <h2 id="callit-leaderboard-heading" class="text-lg font-semibold text-surface-950-50">Rangliste</h2>
        <span class="text-xs text-surface-600-400">Allzeit-Gewinn/Verlust</span>
    </div>

    {#if entries.length === 0}
        <p class="px-5 py-8 text-center text-sm text-surface-600-400">Noch keine abgeschlossenen Vorhersagen. Die Rangliste füllt sich mit dem ersten Ergebnis.</p>
    {:else}
        <ol class="divide-y divide-surface-300-700/40">
            {#each entries as entry (entry.user.id)}
                <li class="flex items-center gap-3 px-4 py-3 sm:px-5 {entry.user.id === currentUserId ? 'bg-primary-500/10' : ''}">
                    <span class="w-7 shrink-0 text-center text-sm font-bold text-surface-600-400">{entry.rank}</span>
                    <ProfilePicture userId={entry.user.id} image={entry.user.image} name={entry.user.name} size="h-9 w-9" />
                    <div class="min-w-0 flex-1">
                        <Username userId={entry.user.id} name={entry.user.name} image={entry.user.image} class="block truncate text-sm font-semibold text-surface-950-50" />
                        <p class="text-xs text-surface-600-400">
                            {#if entry.completedCount === 0}
                                Noch keine abgeschlossene Vorhersage
                            {:else}
                                {entry.completedCount} {entry.completedCount === 1 ? 'Vorhersage' : 'Vorhersagen'}
                                · {entry.wins} gewonnen
                                · {entry.losses} verloren
                            {/if}
                        </p>
                    </div>
                    <a
                        href={`/callit/users/${encodeURIComponent(entry.user.id)}`}
                        class="shrink-0 rounded-lg px-2 py-1 text-sm font-bold underline-offset-2 hover:underline {entry.allTimeProfit > 0 ? 'text-success-700-300' : entry.allTimeProfit < 0 ? 'text-error-700-300' : 'text-surface-600-400'}"
                    >
                        {formatEuroPoints(entry.allTimeProfit, true)}
                    </a>
                </li>
            {/each}
        </ol>
    {/if}
</section>
