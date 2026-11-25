<script lang="ts">
    import { ChevronLeft, ChevronRight } from '@lucide/svelte';

    type Props = {
        page: number;
        pageCount: number;
        onPageChange: (page: number) => void;
        label?: string;
    };

    let { page, pageCount, onPageChange, label = 'Seitennavigation' }: Props = $props();

    const buttonClass = 'inline-flex min-h-8 items-center gap-1 rounded-lg border border-surface-300-700/60 bg-surface-50-950/90 px-2.5 text-sm text-surface-800-200 transition-colors enabled:cursor-pointer enabled:hover:bg-surface-100-900 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
</script>

{#if pageCount > 1}
    <nav class="flex flex-wrap items-center justify-center gap-2" aria-label={label}>
        <button
            type="button"
            class={buttonClass}
            disabled={page <= 1}
            aria-label="Vorherige Seite"
            onclick={() => onPageChange(page - 1)}
        >
            <ChevronLeft class="h-4 w-4" aria-hidden="true" />
            Zurück
        </button>
        <span class="text-xs text-surface-600-400" aria-live="polite">Seite {page} von {pageCount}</span>
        <button
            type="button"
            class={buttonClass}
            disabled={page >= pageCount}
            aria-label="Nächste Seite"
            onclick={() => onPageChange(page + 1)}
        >
            Weiter
            <ChevronRight class="h-4 w-4" aria-hidden="true" />
        </button>
    </nav>
{/if}
