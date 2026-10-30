<script lang="ts">
    import { setPageTitle } from '$lib/utils';
    import Timeline from '$lib/components/crewnow/Timeline.svelte';

    setPageTitle('CrewNow');
</script>

<svelte:head>
    <title>CrewNow - Gnag Home</title>
    <meta name="description" content="Bilder und Momente eurer Gruppe." />
</svelte:head>

<main class="min-h-full">
    <header class="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 pb-2 pt-7 sm:px-6">
        <div>
            <h1 class="text-2xl font-bold text-surface-950-50">CrewNow</h1>
            <p class="mt-1 text-sm text-surface-600-400">Momente aus eurer Gruppe</p>
        </div>
        <a href="/crewnow/create" class="btn preset-filled shrink-0">Neuer Post</a>
    </header>
    <Timeline />
</main>