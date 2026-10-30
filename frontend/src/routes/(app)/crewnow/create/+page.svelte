<script lang="ts">
    import { goto } from '$app/navigation';
    import { setPageTitle } from '$lib/utils';
    import PostEditor from '$lib/components/crewnow/PostEditor.svelte';

    setPageTitle('Neues CrewNow');
</script>

<svelte:head>
    <title>Neues CrewNow - Gnag Home</title>
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-7 sm:px-6">
    <header>
        <a href="/crewnow" class="text-sm text-primary-700-300 hover:underline">← Zurück zu CrewNow</a>
        <h1 class="mt-3 text-2xl font-bold text-surface-950-50">Neuer Post</h1>
    </header>
    <PostEditor mode="create" onSaved={() => void goto('/crewnow')} />
</main>