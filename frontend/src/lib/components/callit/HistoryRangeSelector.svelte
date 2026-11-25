<script lang="ts">
    import { CALL_IT_HISTORY_RANGES, historyRangeLabel } from './format';

    type Props = {
        value: number;
        onChange: (days: number) => void;
        label?: string;
        disabled?: boolean;
    };

    let { value, onChange, label = 'Zeitraum', disabled = false }: Props = $props();
</script>

<div class="flex flex-wrap gap-1" role="group" aria-label={label}>
    {#each CALL_IT_HISTORY_RANGES as range (range)}
        <button
            type="button"
            aria-pressed={value === range}
            {disabled}
            class="rounded-md px-2.5 py-1 text-sm transition-colors enabled:cursor-pointer disabled:cursor-not-allowed {value === range ? 'bg-primary-500 text-primary-contrast-500' : 'text-surface-600-400 enabled:hover:bg-surface-100-900'}"
            onclick={() => onChange(range)}
        >
            {historyRangeLabel(range)}
        </button>
    {/each}
</div>
