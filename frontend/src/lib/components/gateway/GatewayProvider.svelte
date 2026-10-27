<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { GatewayManager } from "$lib/gateway/gateway-manager.svelte";
    import { setGatewayManager } from "$lib/gateway/gateway-context.svelte";
    import type { Snippet } from "svelte";

    let { children }: { children: Snippet } = $props();

    const manager = new GatewayManager();
    setGatewayManager(manager);

    onMount(() => {
        manager.connect();
    });

    onDestroy(() => {
        manager.disconnect();
    });
</script>

{@render children()}