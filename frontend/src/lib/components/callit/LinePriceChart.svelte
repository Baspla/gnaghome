<script lang="ts">
    import PriceChartFrame from './PriceChartFrame.svelte';
    import { lineChartPath } from './history';
    import type { CallItHistoryPoint } from './types';

    type Props = {
        points: CallItHistoryPoint[];
        currency: string | null;
        height?: number;
    };

    let { points, currency, height = 220 }: Props = $props();
</script>

<PriceChartFrame {points} {currency} {height} mode="line">
    {#snippet series({ sampled, xPercent, scale })}
        <path
            d={lineChartPath(sampled, xPercent, scale)}
            fill="none"
            class="stroke-primary-500"
            stroke-width="2.5"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
        />
    {/snippet}
</PriceChartFrame>
