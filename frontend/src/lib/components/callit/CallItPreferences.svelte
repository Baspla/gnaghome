<script lang="ts">
    import { onMount } from 'svelte';
    import { RadioGroup } from 'bits-ui';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import { callItPreferences } from './preferences.svelte';
    import type { CallItChartType } from './types';

    const gateway = getGatewayManager();
    const options: { value: CallItChartType; label: string; description: string }[] = [
        {
            value: 'line',
            label: 'Liniendiagramm',
            description: 'Zeigt den Schlusskurs als durchgehende Linie.',
        },
        {
            value: 'candlestick',
            label: 'Candlestick-Diagramm',
            description: 'Zeigt Eröffnungs-, Höchst-, Tiefst- und Schlusskurs je Kerze.',
        },
    ];

    let successMessage = $state<string | null>(null);

    async function save(chartType: CallItChartType) {
        successMessage = null;
        const saved = await callItPreferences.setChartType(chartType);
        successMessage = saved ? 'Call-it-Präferenzen gespeichert.' : null;
    }

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

<section class="flex flex-col gap-5 border-t border-surface-300-700/60 pt-5" aria-labelledby="callit-preferences-heading">
    <div>
        <h2 id="callit-preferences-heading" class="text-lg font-semibold">Call it</h2>
        <p class="mt-1 text-sm text-surface-contrast-400-800">Wähle, wie Kursverläufe in Call it dargestellt werden.</p>
    </div>

    {#if callItPreferences.loading && !callItPreferences.loaded}
        <p class="text-sm text-surface-contrast-400-800" role="status">Call-it-Präferenzen werden geladen …</p>
    {:else}
        <fieldset disabled={callItPreferences.saving} class="flex flex-col gap-2 disabled:opacity-60">
            <legend class="font-medium mb-2">Diagrammtyp</legend>
            <RadioGroup.Root
                value={callItPreferences.chartType}
                disabled={callItPreferences.saving}
                onValueChange={(value) => {
                    if (value === 'line' || value === 'candlestick') void save(value);
                }}
                aria-label="Diagrammtyp für Call it"
                class="grid gap-2 sm:grid-cols-2"
            >
                {#each options as option (option.value)}
                    <RadioGroup.Item
                        value={option.value}
                        class="flex cursor-pointer flex-col gap-1 rounded-lg border border-surface-300-700 p-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed
                            data-[state=checked]:border-primary-500 data-[state=checked]:bg-primary-500/10 data-[state=checked]:ring-1 data-[state=checked]:ring-primary-500"
                    >
                        <span class="font-semibold">{option.label}</span>
                        <span class="text-xs text-surface-contrast-400-800">{option.description}</span>
                    </RadioGroup.Item>
                {/each}
            </RadioGroup.Root>
        </fieldset>
    {/if}

    {#if callItPreferences.error}<p class="text-sm text-error-700-300" role="alert">{callItPreferences.error}</p>{/if}
    {#if successMessage}<p class="text-sm text-success-700-300" role="status">{successMessage}</p>{/if}
</section>
