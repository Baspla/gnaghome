<script lang="ts">
    import { goto } from '$app/navigation';
    import type { PageProps } from './$types';
    import { api } from '$lib/api';
    import Button from '$lib/components/Button.svelte';
    import PostCard from '$lib/components/crewnow/PostCard.svelte';

    let { data }: PageProps = $props();
    const post = $derived(data.post as {
        id: string;
        author: { id: string; name: string; image: string | null };
        backImage: { id: string; url: string };
        frontImage: { id: string; url: string };
        caption: string | null;
        taggedUsers: Array<{ id: string; name: string; image: string | null }>;
        createdAt: string;
        updatedAt: string;
        canEdit: boolean;
    });
    let deleting = $state(false);
    let showDeleteDialog = $state(false);
    let errorMessage = $state<string | null>(null);

    async function deletePost() {
        if (deleting) return;
        deleting = true;
        errorMessage = null;
        try {
            const response = await api.crewnow.posts({ id: post.id }).delete();
            if (response.error) throw new Error('Delete failed');
            await goto('/crewnow');
        } catch {
            errorMessage = 'Der Post konnte nicht gelöscht werden. Bitte versuche es erneut.';
        } finally {
            deleting = false;
        }
    }
</script>

<svelte:head>
    <title>CrewNow von {post.author.name} - Gnag Home</title>
    <meta name="description" content={post.caption ?? `CrewNow von ${post.author.name}`} />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4 py-7 sm:px-6">
    <header class="flex items-center justify-between gap-4">
        <a href="/crewnow" class="text-sm text-primary-700-300 hover:underline">← Zurück zur Timeline</a>
    </header>
    <PostCard {post} compact={false} hideOpenButton={true} onDelete={() => { errorMessage = null; showDeleteDialog = true; }} />
</main>

{#if showDeleteDialog}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-surface-950/70 p-4"
        role="presentation"
        onclick={(event) => {
            if (event.target === event.currentTarget && !deleting) showDeleteDialog = false;
        }}
        onkeydown={(event) => {
            if (event.key === 'Escape' && !deleting) showDeleteDialog = false;
        }}
    >
        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" class="w-full max-w-md rounded-2xl bg-surface-50-950 p-6 shadow-xl">
            <h2 id="delete-title" class="text-xl font-semibold text-surface-950-50">CrewNow löschen?</h2>
            <p id="delete-description" class="mt-2 text-sm text-surface-700-300">Dieser Post und seine Bilder werden endgültig gelöscht.</p>
            {#if errorMessage}<p class="mt-3 text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}
            <div class="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outlined" disabled={deleting} onclick={() => showDeleteDialog = false}>Abbrechen</Button>
                <Button type="button" disabled={deleting} class="bg-error-500 text-error-contrast-500" onclick={() => void deletePost()}>{deleting ? 'Wird gelöscht …' : 'Endgültig löschen'}</Button>
            </div>
        </div>
    </div>
{/if}