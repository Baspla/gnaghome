<script lang="ts">
    import ToDo from "$lib/components/ToDo.svelte";
import { setPageTitle } from "$lib/utils";
    import { onMount } from "svelte";

    onMount(() => {
        setPageTitle();
    });
</script>

<div class="flex min-h-full w-full items-center justify-center px-4 py-8 text-surface-500-400">
    <div class="text-center">
        <ToDo>

        </ToDo>
    </div>
</div>