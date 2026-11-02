<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { GatewayManager } from "$lib/gateway/gateway-manager.svelte";
    import { setGatewayManager } from "$lib/gateway/gateway-context.svelte";
    import { refreshCustomEmojis } from "$lib/custom-emoji-catalog.svelte";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    const manager = new GatewayManager();
    setGatewayManager(manager);

    onMount(() => {
        void refreshCustomEmojis();
        const unsubscribeEvents = manager.onEvent((event) => {
            if (event.type === 'custom-emojis.changed') void refreshCustomEmojis();
        });
        const unsubscribeConnected = manager.onConnected(() => void refreshCustomEmojis());
        manager.connect();
        return () => {
            unsubscribeEvents();
            unsubscribeConnected();
        };
    });

    onDestroy(() => {
        manager.disconnect();
    });
</script>

{@render children()}