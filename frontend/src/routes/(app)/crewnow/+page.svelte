<script lang="ts">
    import { setPageTitle } from "$lib/utils";
    import PageHeading from "$lib/components/PageHeading.svelte";
    import Timeline from "$lib/components/crewnow/Timeline.svelte";

    setPageTitle("CrewNow");
</script>

<svelte:head>
    <title>CrewNow - Gnag Home</title>
    <meta name="description" content="Bilder und Momente eurer Gruppe." />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header class="flex items-center justify-between gap-4">
        <PageHeading title="CrewNow" />
        <a href="/crewnow/create" class="btn preset-filled shrink-0">Neuer Post</a>
    </header>
    <Timeline />
</main>
