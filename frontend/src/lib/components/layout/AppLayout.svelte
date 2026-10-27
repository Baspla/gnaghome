<script lang="ts">
    import type { Snippet } from "svelte";
    import IconSidebar from "./IconSidebar.svelte";

    let { children }: { children: Snippet } = $props();
</script>

<div
    class="flex h-dvh w-full flex-col overflow-hidden bg-surface-200-800 font-sans text-surface-contrast-200-800 md:flex-row"
>
    <IconSidebar />

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <main class="min-h-0 min-w-0 flex-1 overflow-auto bg-surface-50-950">
            {@render children()}
        </main>
    </div>
</div>
