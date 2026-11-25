<script lang="ts">
    import { onMount } from 'svelte';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import LinePriceChart from './LinePriceChart.svelte';
    import CandlestickPriceChart from './CandlestickPriceChart.svelte';
    import { callItPreferences } from './preferences.svelte';
    import type { CallItHistoryPoint } from './types';

    type Props = {
        points: CallItHistoryPoint[];
        currency: string | null;
        height?: number;
    };

    let { points, currency, height = 220 }: Props = $props();

    const gateway = getGatewayManager();

    onMount(() => {
        void callItPreferences.ensureLoaded();
        const unsubscribeEvent = gateway.onEvent('callit.preferences.changed', (event) => {
            if (event.entityId === 'callit-preferences') void callItPreferences.refresh();
        });
        const unsubscribeConnected = gateway.onConnected(() => void callItPreferences.refresh());
        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

{#if callItPreferences.chartType === 'candlestick'}
    <CandlestickPriceChart {points} {currency} {height} />
{:else}
    <LinePriceChart {points} {currency} {height} />
{/if}

