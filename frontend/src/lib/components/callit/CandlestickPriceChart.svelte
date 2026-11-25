<script lang="ts">
    import PriceChartFrame from './PriceChartFrame.svelte';
    import { candleGeometries, CHART_VIEW_HEIGHT } from './history';
    import type { CallItHistoryPoint } from './types';

    type Props = {
        points: CallItHistoryPoint[];
        currency: string | null;
        height?: number;
    };

    let { points, currency, height = 220 }: Props = $props();

    const minimumBodyHeight = $derived(Math.max(1, (CHART_VIEW_HEIGHT / Math.max(height, 1)) * 1.25));
</script>

<PriceChartFrame {points} {currency} {height} mode="candlestick">
    {#snippet series({ sampled, xPercent, scale })}
        <g>
            {#each candleGeometries(sampled, xPercent, scale, minimumBodyHeight) as candle (candle.observedAt)}
                <line
                    x1={candle.centerX}
                    y1={candle.highY}
                    x2={candle.centerX}
                    y2={candle.lowY}
                    class={candle.direction === 'up'
                        ? 'stroke-success-500'
                        : candle.direction === 'down'
                            ? 'stroke-error-500'
                            : 'stroke-surface-500'}
                    stroke-width="1"
                    vector-effect="non-scaling-stroke"
                />
                <rect
                    x={candle.bodyX}
                    y={candle.bodyY}
                    width={candle.bodyWidth}
                    height={candle.bodyHeight}
                    rx="0.5"
                    class={candle.direction === 'up'
                        ? 'fill-success-500'
                        : candle.direction === 'down'
                            ? 'fill-error-500'
                            : 'fill-surface-500'}
                />
            {/each}
        </g>
    {/snippet}
</PriceChartFrame>
