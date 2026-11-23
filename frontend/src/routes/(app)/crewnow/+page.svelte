<script lang="ts">
    import { setPageTitle } from "$lib/utils";
    import PageHeading from "$lib/components/PageHeading.svelte";
    import Timeline from "$lib/components/crewnow/Timeline.svelte";
    import Camera from "@lucide/svelte/icons/camera";

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

<a
    href="/crewnow/create"
    aria-label="Neuen Post erstellen"
    title="Neuen Post erstellen"
    class="btn preset-filled fixed bottom-20 right-5 z-40 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-0 p-0 shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 md:bottom-6 md:right-6"
>
    <Camera class="h-6 w-6" aria-hidden="true" />
</a>
