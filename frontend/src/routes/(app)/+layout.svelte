<script lang="ts">
  import { page } from "$app/state";
  import GatewayProvider from "$lib/components/gateway/GatewayProvider.svelte";
  import AppLayout from "$lib/components/layout/AppLayout.svelte";

  let {
    children,
  }: { children: import("svelte").Snippet } = $props();

  const user = $derived(page.data.user ?? null);
</script>

{#if user}
  <GatewayProvider>
    <AppLayout>
      {@render children()}
    </AppLayout>
  </GatewayProvider>
{:else}
  <div class="h-screen">
    {@render children()}
  </div>
{/if}
