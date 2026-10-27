<script lang="ts">
    import type { Snippet } from "svelte";

    let {
        children,
    }: {
        children?: Snippet;
    } = $props();
</script>

<div class="flex flex-col overflow-hidden border-amber-400 border">
    <p class="font-bold">To-Do</p>
    {#if children}
        {@render children()}
    {/if}
</div>
