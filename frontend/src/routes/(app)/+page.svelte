<script lang="ts">
    import { setPageTitle } from "$lib/utils";
    import { onMount } from "svelte";

    onMount(() => {
        setPageTitle();
    });
</script>

<div class="flex min-h-full w-full items-center justify-center px-4 py-8 text-surface-500-400">
    <div class="text-center">
        <h1 class="text-2xl font-semibold text-surface-contrast-200-800">Dashboard</h1>
        <p class="mt-2">Your connected services will appear here.</p>
    </div>
</div>